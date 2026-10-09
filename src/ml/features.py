"""
Feature engineering functions for F1 Synapse ML models.
Extracts spatial, kinematic, and stint features from live or replay frames.
Qt-free and completely vectorized / optimized.
"""

import math
from collections import deque
from typing import Dict, Optional, Tuple, Any
import numpy as np
import pandas as pd


class SlidingWelford:
    """Computes rolling mean and variance in O(1) time using Welford's Algorithm."""

    def __init__(self, maxlen: int):
        self.maxlen = maxlen
        self.window = deque(maxlen=maxlen)
        self.mean = 0.0
        self.m2 = 0.0

    def update(self, val: float):
        if len(self.window) == self.maxlen:
            old_val = self.window.popleft()
            n_old = self.maxlen
            if n_old > 1:
                prev_mean = self.mean
                self.mean = (self.mean * n_old - old_val) / (n_old - 1)
                self.m2 -= (old_val - prev_mean) * (old_val - self.mean)
            else:
                self.mean = 0.0
                self.m2 = 0.0

        self.window.append(val)
        n_new = len(self.window)
        if n_new == 1:
            self.mean = val
            self.m2 = 0.0
        else:
            prev_mean = self.mean
            self.mean += (val - prev_mean) / n_new
            self.m2 += (val - prev_mean) * (val - self.mean)

    @property
    def variance(self) -> float:
        return self.m2 / len(self.window) if len(self.window) > 1 else 0.0

    @property
    def std_dev(self) -> float:
        return math.sqrt(self.variance)


class DriverTelemetryState:
    """Maintains rolling buffers for a single driver for high-frequency aggression features."""

    def __init__(self, driver_code: str, fps: float = 25.0, window_sec: float = 3.0):
        self.code = driver_code
        self.dt = 1.0 / fps
        self.maxlen = int(fps * window_sec)
        self.throttle_stats = SlidingWelford(maxlen=self.maxlen)
        self.brake_stats = SlidingWelford(maxlen=self.maxlen)
        self.last_throttle = 0.0
        self.last_speed = 0.0
        self.current_throttle_jerk = 0.0
        self.current_brake_severity = 0.0

    def update(self, telemetry: dict):
        throttle = float(telemetry.get("throttle", 0.0))
        brake = float(telemetry.get("brake", 0.0))
        speed = float(telemetry.get("speed", 0.0))

        self.throttle_stats.update(throttle)
        self.brake_stats.update(brake)

        self.current_throttle_jerk = (throttle - self.last_throttle) / self.dt
        acceleration = (speed - self.last_speed) / self.dt
        if acceleration < 0 and brake > 0:
            self.current_brake_severity = brake * abs(acceleration)
        else:
            self.current_brake_severity = 0.0

        self.last_throttle = throttle
        self.last_speed = speed


class KinematicEngine:
    """Computes relational data between cars (gaps, closing velocities)."""

    @staticmethod
    def calculate_battle_metrics(chaser: dict, target: dict, circuit_length: float) -> dict:
        dx = float(target.get("x", 0.0)) - float(chaser.get("x", 0.0))
        dy = float(target.get("y", 0.0)) - float(chaser.get("y", 0.0))
        euclidean_dist = math.sqrt(dx**2 + dy**2)

        dist_chaser = float(chaser.get("dist", 0.0))
        dist_target = float(target.get("dist", 0.0))
        delta_s = (dist_target - dist_chaser) % circuit_length

        v_chaser = float(chaser.get("speed", 0.0))
        v_target = float(target.get("speed", 0.0))
        delta_v = v_chaser - v_target

        ttc = delta_s / max(delta_v, 0.01) if delta_v > 0 else float("inf")

        return {
            "euclidean_gap": euclidean_dist,
            "along_track_gap": delta_s,
            "velocity_delta": delta_v,
            "time_to_collision": ttc,
        }


def extract_overtake_features(
    att: dict,
    dfnd: dict,
    att_code: str = "",
    circuit_len: float = 5807.0,
    driver_history: Optional[Dict[str, Any]] = None,
) -> Tuple[pd.DataFrame, float, float, int]:
    """
    Extract the 8 features expected by overtake_lgbm.joblib:
    ['delta_s', 'delta_v', 'euclidean_dist', 'drs_active', 'mean_throttle', 'throttle_jerk', 'mean_brake', 'tyre_age_delta']
    """
    frac_att = float(att.get("fraction", 0.0))
    frac_dfnd = float(dfnd.get("fraction", 0.0))
    delta_frac = (frac_dfnd - frac_att) % 1.0

    # If attacker pulls ahead slightly, delta_frac wraps to ~0.99.
    # Convert to negative gap to indicate side-by-side or passing.
    if delta_frac > 0.5:
        delta_frac -= 1.0

    delta_s = delta_frac * circuit_len

    speed_att = float(att.get("speed", 0.0))
    speed_dfnd = float(dfnd.get("speed", 0.0))
    delta_v = speed_att - speed_dfnd

    dx = float(dfnd.get("x", 0.0)) - float(att.get("x", 0.0))
    dy = float(dfnd.get("y", 0.0)) - float(att.get("y", 0.0))
    euclidean_dist = float(np.sqrt(dx * dx + dy * dy))

    raw_drs = int(att.get("drs", 0))
    drs_active = 1 if (raw_drs >= 10 or raw_drs == 2) else 0

    att_hist = driver_history.get(att_code, []) if driver_history else []
    if len(att_hist) >= 5:
        throttles = [s[2] for s in att_hist]
        brakes = [s[3] for s in att_hist]
        mean_throttle = float(np.mean(throttles))
        throttle_jerk = float((throttles[-1] - throttles[0]) / max(len(throttles) * 0.04, 0.001))
        mean_brake = float(np.mean(brakes))
    else:
        mean_throttle = float(att.get("throttle", 0.0))
        throttle_jerk = 0.0
        mean_brake = float(att.get("brake", 0.0))

    tyre_age_delta = float(att.get("tyre_life", 0.0)) - float(dfnd.get("tyre_life", 0.0))

    feature_vector = pd.DataFrame(
        [
            {
                "delta_s": delta_s,
                "delta_v": delta_v,
                "euclidean_dist": euclidean_dist,
                "drs_active": drs_active,
                "mean_throttle": mean_throttle,
                "throttle_jerk": throttle_jerk,
                "mean_brake": mean_brake,
                "tyre_age_delta": tyre_age_delta,
            }
        ]
    )

    return feature_vector, delta_s, delta_v, drs_active


def extract_pit_features(att: dict, track_status: str) -> Tuple[pd.DataFrame, int, float]:
    """
    Extract the 5 features expected by pit_window_xgb.joblib:
    ['tyre_life', 'tyre_compound', 'sc_active', 'vsc_active', 'lap_number']
    """
    tyre_life = int(att.get("tyre_life", 0))
    tyre_compound = float(att.get("tyre", 1.0))
    status_str = str(track_status)
    sc_active = 1 if status_str == "4" else 0
    vsc_active = 1 if status_str in ("6", "7") else 0
    lap_number = int(att.get("lap", 1))

    feature_vector = pd.DataFrame(
        [
            {
                "tyre_life": tyre_life,
                "tyre_compound": tyre_compound,
                "sc_active": sc_active,
                "vsc_active": vsc_active,
                "lap_number": lap_number,
            }
        ]
    )

    return feature_vector, tyre_life, tyre_compound
