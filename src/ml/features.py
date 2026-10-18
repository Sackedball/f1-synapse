"""
Feature engineering functions for F1 Synapse ML models.
Extracts spatial, kinematic, driver control, and strategy features from live or replay frames.
Qt-free and completely vectorized / optimized.
"""

import math
from collections import deque
from typing import Any, Dict, List, Optional, Tuple, Union
import numpy as np
import pandas as pd


# ---------------------------------------------------------------------------
# Feature Schema Definitions & Physical Constants
# ---------------------------------------------------------------------------

OVERTAKE_FEATURE_COLUMNS: List[str] = [
    "delta_s",
    "delta_v",
    "euclidean_dist",
    "drs_active",
    "mean_throttle",
    "throttle_jerk",
    "mean_brake",
    "brake_onset_delta",
    "tyre_age_delta",
    "compound_delta",
    "clean_air_pace_diff",
    "dist_to_next_heavy_braking",
    "straight_fraction_remaining",
    "curvature",
]

PIT_FEATURE_COLUMNS: List[str] = [
    "tyre_life",
    "tyre_compound",
    "stint_progression_ratio",
    "fuel_corrected_degradation_slope",
    "pit_loss_delta",
    "traffic_rejoin_gap",
    "sc_active",
    "vsc_active",
    "lap_number",
]

EXPECTED_COMPOUND_LIFE: Dict[int, float] = {
    0: 20.0,  # SOFT
    1: 28.0,  # MEDIUM
    2: 36.0,  # HARD
    3: 25.0,  # INTERMEDIATE
    4: 30.0,  # WET
}

COMPOUND_GRIP_SCORE: Dict[int, float] = {
    0: 3.0,   # SOFT
    1: 2.0,   # MEDIUM
    2: 1.0,   # HARD
    3: 0.0,   # INTERMEDIATE
    4: -1.0,  # WET
}

FUEL_BURN_SEC_PER_LAP: float = 0.045
PIT_LOSS_GREEN_SEC: float = 22.0
PIT_LOSS_VSC_SEC: float = 13.5
PIT_LOSS_SC_SEC: float = 10.0


# ---------------------------------------------------------------------------
# 0. DataFrame Schema Normalization Helper
# ---------------------------------------------------------------------------

def standardize_laps_dataframe(laps_df: pd.DataFrame) -> pd.DataFrame:
    """
    Standardizes varying column schemas (e.g. from FastF1 core vs web Session LapRow models)
    into a unified DataFrame schema:
    - Driver: driver code string (e.g. 'VER')
    - LapNumber: integer lap number
    - LapTime: pd.Timedelta lap duration
    - LapTimeSec: float lap time in seconds
    - PitInTime: pd.Timedelta if car boxed on this lap, else pd.NaT
    - PitOutTime: pd.Timedelta if car exited pits on this lap, else pd.NaT
    - Compound: tyre compound string ('SOFT', 'MEDIUM', 'HARD', etc.)
    - TyreLife: tyre age in laps
    - Stint: stint index (1-based)
    - Position: integer race position
    - TrackStatus: track condition string
    - Time: cumulative elapsed race time (calculated from LapTime cumsum if missing)
    """
    if laps_df is None or laps_df.empty:
        return pd.DataFrame()

    df = laps_df.copy()

    rename_map = {
        "driver": "Driver",
        "lap": "LapNumber",
        "lap_number": "LapNumber",
        "timeSec": "LapTimeSec",
        "time_sec": "LapTimeSec",
        "lap_time_sec": "LapTimeSec",
        "compound": "Compound",
        "tyreLife": "TyreLife",
        "tyre_life": "TyreLife",
        "stint": "Stint",
        "position": "Position",
        "trackStatus": "TrackStatus",
        "track_status": "TrackStatus",
        "pitIn": "PitIn",
        "pit_in": "PitIn",
        "pitOut": "PitOut",
        "pit_out": "PitOut",
    }
    for old_k, new_k in rename_map.items():
        if old_k in df.columns and new_k not in df.columns:
            df[new_k] = df[old_k]

    # Convert LapTime and LapTimeSec
    if "LapTimeSec" not in df.columns and "LapTime" in df.columns:
        if pd.api.types.is_timedelta64_dtype(df["LapTime"]):
            df["LapTimeSec"] = df["LapTime"].dt.total_seconds()
        else:
            df["LapTimeSec"] = pd.to_numeric(df["LapTime"], errors="coerce")

    if "LapTime" not in df.columns and "LapTimeSec" in df.columns:
        df["LapTime"] = pd.to_timedelta(pd.to_numeric(df["LapTimeSec"], errors="coerce"), unit="s")
    elif "LapTime" in df.columns and not pd.api.types.is_timedelta64_dtype(df["LapTime"]):
        if pd.api.types.is_numeric_dtype(df["LapTime"]):
            df["LapTime"] = pd.to_timedelta(df["LapTime"], unit="s")
        else:
            df["LapTime"] = pd.to_timedelta(df["LapTime"], errors="coerce")

    # Convert PitInTime / PitOutTime
    if "PitInTime" not in df.columns:
        if "PitIn" in df.columns:
            df["PitInTime"] = df["PitIn"].apply(
                lambda p: pd.to_timedelta(1, unit="s") if (p is True or p == 1 or p == "1") else pd.NaT
            )
        else:
            df["PitInTime"] = pd.to_timedelta(pd.Series(np.nan, index=df.index), unit="s")
    elif not pd.api.types.is_timedelta64_dtype(df["PitInTime"]):
        if df["PitInTime"].isna().all():
            df["PitInTime"] = pd.to_timedelta(pd.Series(np.nan, index=df.index), unit="s")
        elif pd.api.types.is_numeric_dtype(df["PitInTime"]):
            df["PitInTime"] = pd.to_timedelta(df["PitInTime"], unit="s")
        elif not pd.api.types.is_datetime64_any_dtype(df["PitInTime"]):
            df["PitInTime"] = pd.to_timedelta(df["PitInTime"], errors="coerce")

    if "PitOutTime" not in df.columns:
        if "PitOut" in df.columns:
            df["PitOutTime"] = df["PitOut"].apply(
                lambda p: pd.to_timedelta(1, unit="s") if (p is True or p == 1 or p == "1") else pd.NaT
            )
        else:
            df["PitOutTime"] = pd.to_timedelta(pd.Series(np.nan, index=df.index), unit="s")
    elif not pd.api.types.is_timedelta64_dtype(df["PitOutTime"]):
        if df["PitOutTime"].isna().all():
            df["PitOutTime"] = pd.to_timedelta(pd.Series(np.nan, index=df.index), unit="s")
        elif pd.api.types.is_numeric_dtype(df["PitOutTime"]):
            df["PitOutTime"] = pd.to_timedelta(df["PitOutTime"], unit="s")
        elif not pd.api.types.is_datetime64_any_dtype(df["PitOutTime"]):
            df["PitOutTime"] = pd.to_timedelta(df["PitOutTime"], errors="coerce")

    # Driver as string
    if "Driver" in df.columns:
        df["Driver"] = df["Driver"].astype(str)

    # LapNumber as integer
    if "LapNumber" in df.columns:
        df["LapNumber"] = pd.to_numeric(df["LapNumber"], errors="coerce").fillna(1).astype(int)

    # Reconstruct cumulative Time if missing or all NaT
    if "Time" not in df.columns or df["Time"].isna().all():
        if "LapTime" in df.columns and "Driver" in df.columns:
            df = df.sort_values(["Driver", "LapNumber"]) if "LapNumber" in df.columns else df
            df["Time"] = df.groupby("Driver")["LapTime"].cumsum()
        else:
            df["Time"] = pd.to_timedelta(pd.Series(np.nan, index=df.index), unit="s")
    elif not pd.api.types.is_timedelta64_dtype(df["Time"]):
        if pd.api.types.is_numeric_dtype(df["Time"]):
            df["Time"] = pd.to_timedelta(df["Time"], unit="s")
        elif not pd.api.types.is_datetime64_any_dtype(df["Time"]):
            df["Time"] = pd.to_timedelta(df["Time"], errors="coerce")

    return df


# ---------------------------------------------------------------------------
# 1. Driver Control Commitment & Telemetry Buffers
# ---------------------------------------------------------------------------

class SlidingWelford:
    """Computes rolling mean and variance in O(1) time using Welford's Algorithm."""

    def __init__(self, maxlen: int):
        self.maxlen = max(1, maxlen)
        self.window: deque = deque(maxlen=self.maxlen)
        self.mean: float = 0.0
        self.m2: float = 0.0

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
            self.mean = float(val)
            self.m2 = 0.0
        else:
            prev_mean = self.mean
            self.mean += (val - prev_mean) / n_new
            self.m2 += (val - prev_mean) * (val - self.mean)

    @property
    def variance(self) -> float:
        return float(self.m2 / len(self.window)) if len(self.window) > 1 else 0.0

    @property
    def std_dev(self) -> float:
        return float(math.sqrt(max(0.0, self.variance)))


class DriverTelemetryState:
    """
    Maintains rolling buffers for a single driver for high-frequency control commitment features.
    Enforces uniform scale:
      - Throttle in [0, 100]
      - Brake in {0, 1}
    Calculates real longitudinal throttle jerk dThrottle/dt and braking onset delta.
    """

    def __init__(self, driver_code: str, fps: float = 25.0, window_sec: float = 3.0):
        self.code = driver_code
        self.dt = float(1.0 / max(fps, 1.0))
        self.maxlen = max(1, int(fps * window_sec))
        self.throttle_stats = SlidingWelford(maxlen=self.maxlen)
        self.brake_stats = SlidingWelford(maxlen=self.maxlen)
        self._initialized: bool = False
        self.last_throttle = 0.0
        self.last_brake = 0.0
        self.last_speed = 0.0
        self.current_throttle_jerk = 0.0
        self.current_brake_onset_delta = 0.0
        self.current_brake_severity = 0.0

    def update(self, telemetry: dict):
        raw_throttle = float(telemetry.get("throttle", 0.0))
        raw_brake = float(telemetry.get("brake", 0.0))
        speed = float(telemetry.get("speed", 0.0))

        # Uniform scale: Throttle in [0, 100]
        if 0.0 < raw_throttle <= 1.0:
            throttle = raw_throttle * 100.0
        else:
            throttle = float(max(0.0, min(100.0, raw_throttle)))

        # Uniform scale: Brake in {0, 1}
        brake = 1.0 if raw_brake > 0.0 else 0.0

        self.throttle_stats.update(throttle)
        self.brake_stats.update(brake)

        if not self._initialized:
            self.current_throttle_jerk = 0.0
            self.current_brake_onset_delta = 0.0
            self.current_brake_severity = 0.0
            self._initialized = True
        else:
            self.current_throttle_jerk = float((throttle - self.last_throttle) / self.dt)
            self.current_brake_onset_delta = float((brake - self.last_brake) / self.dt)

            acceleration = (speed - self.last_speed) / self.dt
            if acceleration < 0 and brake > 0:
                self.current_brake_severity = float(brake * abs(acceleration))
            else:
                self.current_brake_severity = 0.0

        self.last_throttle = throttle
        self.last_brake = brake
        self.last_speed = speed

    @property
    def mean_throttle(self) -> float:
        return float(self.throttle_stats.mean)

    @property
    def mean_brake(self) -> float:
        return float(self.brake_stats.mean)

    @property
    def throttle_jerk(self) -> float:
        return float(self.current_throttle_jerk)

    @property
    def brake_onset_delta(self) -> float:
        return float(self.current_brake_onset_delta)

    @property
    def throttle_variance(self) -> float:
        return float(self.throttle_stats.variance)

    @property
    def brake_variance(self) -> float:
        return float(self.brake_stats.variance)


class KinematicEngine:
    """Computes relational data between cars (gaps, closing velocities)."""

    @staticmethod
    def calculate_battle_metrics(chaser: dict, target: dict, circuit_length: float) -> dict:
        dx = float(target.get("x", 0.0)) - float(chaser.get("x", 0.0))
        dy = float(target.get("y", 0.0)) - float(chaser.get("y", 0.0))
        euclidean_dist = math.sqrt(dx**2 + dy**2)

        dist_chaser = float(chaser.get("dist", 0.0))
        dist_target = float(target.get("dist", 0.0))
        delta_s = (dist_target - dist_chaser) % circuit_length if circuit_length > 0 else 0.0

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


# ---------------------------------------------------------------------------
# 2. Track Topology & Curvature Engine
# ---------------------------------------------------------------------------

def compute_track_curvature(centerline: Any) -> np.ndarray:
    """
    Computes local curvature kappa = |x_dot * y_ddot - y_dot * x_ddot| / (x_dot^2 + y_dot^2)^(3/2)
    from TrackGeometry.centerline coordinates.
    Returns a 1D numpy array of curvature values along the centerline with periodic boundary handling.
    """
    if centerline is None or len(centerline) < 3:
        return np.array([0.0], dtype=np.float32)

    pts = np.asarray(centerline, dtype=np.float64)
    if pts.ndim != 2 or pts.shape[1] < 2:
        return np.array([0.0], dtype=np.float32)

    # Check for closed loop duplicate endpoint (e.g. pts[0] == pts[-1])
    is_closed = len(pts) > 3 and np.allclose(pts[0], pts[-1])
    p = pts[:-1] if is_closed else pts
    x = p[:, 0]
    y = p[:, 1]
    n = len(x)
    if n < 3:
        return np.zeros(len(pts), dtype=np.float32)

    # Periodic wrap-around padding for closed circuit loop
    pad_len = min(5, n)
    x_pad = np.pad(x, pad_len, mode="wrap")
    y_pad = np.pad(y, pad_len, mode="wrap")

    dx = np.gradient(x_pad)
    dy = np.gradient(y_pad)
    ddx = np.gradient(dx)
    ddy = np.gradient(dy)

    # Slice back to original bounds
    dx = dx[pad_len : pad_len + n]
    dy = dy[pad_len : pad_len + n]
    ddx = ddx[pad_len : pad_len + n]
    ddy = ddy[pad_len : pad_len + n]

    numerator = np.abs(dx * ddy - dy * ddx)
    denominator = (dx**2 + dy**2) ** 1.5
    denominator = np.maximum(denominator, 1e-9)

    kappa = (numerator / denominator).astype(np.float32)
    if is_closed:
        kappa = np.append(kappa, kappa[0]).astype(np.float32)
    return kappa


def compute_distance_to_next_heavy_braking(
    dist_m: float,
    braking_zones: Optional[List[float]],
    circuit_length: float,
) -> float:
    """
    Computes track distance (meters) to the next heavy braking zone ahead in [0, circuit_length).
    """
    if not braking_zones or circuit_length <= 0:
        return 999.0

    s_norm = dist_m % circuit_length
    deltas = [(bz - s_norm) % circuit_length for bz in braking_zones]
    return round(float(min(deltas)), 2)


def compute_straight_fraction_remaining(
    dist_m: float,
    circuit_length: float,
    centerline: Optional[Any] = None,
    curvature_array: Optional[np.ndarray] = None,
    braking_zones: Optional[List[float]] = None,
    curvature_straight_thresh: float = 0.0025,
) -> float:
    """
    Calculates straight fraction remaining in [0.0, 1.0] along the current track segment.
    If car is on a straight preceding a corner/braking zone, returns fraction remaining
    (1.0 at straight entry, decaying toward 0.0 at braking onset).
    Returns 0.0 if the car is currently negotiating a corner.
    """
    if circuit_length <= 0:
        return 0.0

    s = dist_m % circuit_length

    # 1. Curvature-derived straight fraction if centerline is provided
    if curvature_array is None and centerline is not None and len(centerline) >= 3:
        curvature_array = compute_track_curvature(centerline)

    if curvature_array is not None and len(curvature_array) >= 3:
        n = len(curvature_array)
        idx = int((s / circuit_length) * n) % n
        curr_k = float(curvature_array[idx])

        # If currently in a corner, straight fraction remaining is 0.0
        if curr_k > curvature_straight_thresh:
            return 0.0

        # Scan forward to find next corner (where curvature > threshold)
        steps_to_corner = 0
        for step in range(1, n):
            chk_idx = (idx + step) % n
            if curvature_array[chk_idx] > curvature_straight_thresh:
                break
            steps_to_corner += 1

        # Scan backward to find start of this straight
        steps_from_corner = 0
        for step in range(1, n):
            chk_idx = (idx - step) % n
            if curvature_array[chk_idx] > curvature_straight_thresh:
                break
            steps_from_corner += 1

        total_straight_pts = steps_from_corner + steps_to_corner
        if total_straight_pts > 0:
            fraction = steps_to_corner / total_straight_pts
            return round(float(np.clip(fraction, 0.0, 1.0)), 3)
        return 1.0

    # 2. Fallback using distance to next braking zone
    if braking_zones:
        d_next = compute_distance_to_next_heavy_braking(dist_m, braking_zones, circuit_length)
        nominal_straight_len = 400.0
        if d_next <= nominal_straight_len:
            fraction = d_next / nominal_straight_len
            return round(float(np.clip(fraction, 0.0, 1.0)), 3)

    return 0.0


# ---------------------------------------------------------------------------
# 3. Clean-Air Pace Differential Engine
# ---------------------------------------------------------------------------

def compute_rolling_clean_air_pace(
    driver_laps: pd.DataFrame,
    current_lap: int,
    window_size: int = 5,
    fallback_pace: float = 90.0,
) -> float:
    """
    Calculates driver's rolling median clean-air lap time over preceding 5 laps (in seconds).
    Filters for green-flag flying laps without pit-ins or pit-outs.
    """
    if driver_laps is None or driver_laps.empty:
        return fallback_pace

    df = standardize_laps_dataframe(driver_laps)
    if df.empty or "LapNumber" not in df.columns or "LapTimeSec" not in df.columns:
        return fallback_pace

    if current_lap > 1:
        mask = (df["LapNumber"] < current_lap) & (df["LapNumber"] >= max(1, current_lap - window_size))
    else:
        mask = df["LapNumber"] <= 1

    if "TrackStatus" in df.columns:
        mask &= (df["TrackStatus"].astype(str) == "1")

    if "PitInTime" in df.columns:
        mask &= df["PitInTime"].isna()

    if "PitOutTime" in df.columns:
        mask &= df["PitOutTime"].isna()

    subset = df[mask]
    if not subset.empty:
        times_sec = pd.to_numeric(subset["LapTimeSec"], errors="coerce").dropna().to_numpy()
        if len(times_sec) > 0:
            val = float(np.median(times_sec))
            if not math.isnan(val) and val > 0:
                return round(val, 3)

    # Fallback to driver's overall median clean pace if window lacks clean laps
    clean_all = df[df["TrackStatus"].astype(str) == "1"] if "TrackStatus" in df.columns else df
    if "PitInTime" in clean_all.columns:
        clean_all = clean_all[clean_all["PitInTime"].isna()]
    if "PitOutTime" in clean_all.columns:
        clean_all = clean_all[clean_all["PitOutTime"].isna()]
    if not clean_all.empty:
        all_times = pd.to_numeric(clean_all["LapTimeSec"], errors="coerce").dropna().to_numpy()
        if len(all_times) > 0:
            val = float(np.median(all_times))
            if not math.isnan(val) and val > 0:
                return round(val, 3)

    return fallback_pace


def compute_clean_air_pace_diff(
    att_laps: pd.DataFrame,
    dfnd_laps: pd.DataFrame,
    current_lap: int,
    window_size: int = 5,
    fallback_pace: float = 90.0,
) -> float:
    """
    Attacker rolling median clean-air lap time minus defender rolling clean-air median lap time
    over the preceding 5 laps (Delta Pace_clean). Negative values indicate attacker lap time advantage.
    """
    if att_laps is None or att_laps.empty or dfnd_laps is None or dfnd_laps.empty or current_lap <= 1:
        return 0.0

    p_att = compute_rolling_clean_air_pace(att_laps, current_lap, window_size, fallback_pace)
    p_dfnd = compute_rolling_clean_air_pace(dfnd_laps, current_lap, window_size, fallback_pace)

    if p_att == fallback_pace or p_dfnd == fallback_pace:
        return 0.0

    diff = p_att - p_dfnd
    if math.isnan(diff):
        return 0.0
    return round(float(diff), 4)


# ---------------------------------------------------------------------------
# 4. Pit Strategy Signals Engine
# ---------------------------------------------------------------------------

def compute_stint_progression_ratio(
    tyre_life: float,
    tyre_compound: Union[int, float, str],
) -> float:
    """
    Compound stint progress ratio = TyreAge / MaxStintLimit (for Soft/Medium/Hard/etc.).
    """
    if isinstance(tyre_compound, str):
        comp_map = {"SOFT": 0, "MEDIUM": 1, "HARD": 2, "INTERMEDIATE": 3, "WET": 4}
        c_int = comp_map.get(tyre_compound.upper(), 1)
    else:
        try:
            c_int = int(round(float(tyre_compound)))
        except (ValueError, TypeError):
            c_int = 1

    max_limit = EXPECTED_COMPOUND_LIFE.get(c_int, 28.0)
    ratio = float(tyre_life) / max(max_limit, 1.0)
    return round(float(np.clip(ratio, 0.0, 2.5)), 3)


def compute_fuel_corrected_degradation_slope(
    driver_laps: pd.DataFrame,
    current_lap: int,
    stint_start_lap: int = 1,
    window_size: int = 5,
    fuel_burn_sec: float = FUEL_BURN_SEC_PER_LAP,
) -> float:
    """
    Calculates fuel-corrected tyre degradation slope d/dL(T_lap - gamma * M_fuel) in seconds/lap.
    """
    if driver_laps is None or driver_laps.empty:
        return 0.0

    df = standardize_laps_dataframe(driver_laps)
    if df.empty or "LapNumber" not in df.columns or "LapTimeSec" not in df.columns:
        return 0.0

    mask = (df["LapNumber"] <= current_lap) & (df["LapNumber"] >= stint_start_lap)
    if "TrackStatus" in df.columns:
        mask &= (df["TrackStatus"].astype(str) == "1")

    if "PitInTime" in df.columns:
        mask &= df["PitInTime"].isna()
    if "PitOutTime" in df.columns:
        mask &= df["PitOutTime"].isna()

    subset = df[mask].sort_values("LapNumber").tail(window_size)
    if len(subset) < 2:
        return 0.0

    x = subset["LapNumber"].to_numpy().astype(float)
    raw_times = pd.to_numeric(subset["LapTimeSec"], errors="coerce").to_numpy()

    valid_mask = ~np.isnan(raw_times)
    if valid_mask.sum() < 2:
        return 0.0

    x = x[valid_mask]
    y = raw_times[valid_mask] + fuel_burn_sec * (x - float(stint_start_lap))

    x_mean = np.mean(x)
    y_mean = np.mean(y)
    numerator = np.sum((x - x_mean) * (y - y_mean))
    denominator = np.sum((x - x_mean) ** 2)

    if denominator <= 1e-6:
        return 0.0

    slope = float(numerator / denominator)
    if math.isnan(slope):
        return 0.0
    return round(slope, 4)


def compute_pit_loss_delta(track_status: Union[int, str]) -> float:
    """
    Neutralization pit loss delta: seconds saved under SC/VSC vs green flag.
    Green: 0.0s (loss ~22s).
    VSC: 8.5s (loss ~13.5s).
    SC: 12.0s (loss ~10.0s).
    Red: 22.0s (neutralized).
    """
    try:
        status_code = int(track_status)
    except (ValueError, TypeError):
        status_code = 1

    if status_code == 4:
        return PIT_LOSS_GREEN_SEC - PIT_LOSS_SC_SEC
    if status_code in (6, 7):
        return PIT_LOSS_GREEN_SEC - PIT_LOSS_VSC_SEC
    if status_code == 2:
        return 2.0
    if status_code == 5:
        return PIT_LOSS_GREEN_SEC
    return 0.0


def compute_traffic_rejoin_gap(
    driver_code: str,
    current_lap: int,
    laps_df: pd.DataFrame,
    pit_loss_sec: float = PIT_LOSS_GREEN_SEC,
) -> float:
    """
    Projects driver's track gap to surrounding traffic (seconds) upon pit exit.
    A small gap (< 1.5s) denotes severe traffic rejoin / undercut pressure.
    """
    if laps_df is None or laps_df.empty:
        return 10.0

    df = standardize_laps_dataframe(laps_df)
    if df.empty or "Driver" not in df.columns or "LapNumber" not in df.columns or "Time" not in df.columns:
        return 10.0

    driver_rows = df[(df["Driver"] == str(driver_code)) & (df["LapNumber"] == current_lap)]
    if driver_rows.empty:
        return 10.0

    t_val = driver_rows.iloc[0]["Time"]
    if pd.isna(t_val):
        return 10.0
    t_current = t_val.total_seconds() if hasattr(t_val, "total_seconds") else float(t_val)
    t_projected = t_current + pit_loss_sec

    # First check cars on the exact same lap
    nearby_laps = df[
        (df["Driver"] != str(driver_code))
        & (df["LapNumber"] == current_lap)
        & df["Time"].notna()
    ]
    if nearby_laps.empty:
        # Fall back to adjacent laps if field is spread
        nearby_laps = df[
            (df["Driver"] != str(driver_code))
            & (df["LapNumber"] >= max(1, current_lap - 1))
            & (df["LapNumber"] <= current_lap + 1)
            & df["Time"].notna()
        ]
    if nearby_laps.empty:
        return 20.0

    other_times = np.array([
        t.total_seconds() if hasattr(t, "total_seconds") else float(t)
        for t in nearby_laps["Time"]
    ])

    cars_ahead = other_times[other_times <= t_projected]
    gap_ahead = float(t_projected - np.max(cars_ahead)) if len(cars_ahead) > 0 else 25.0

    cars_behind = other_times[other_times > t_projected]
    gap_behind = float(np.min(cars_behind) - t_projected) if len(cars_behind) > 0 else 25.0

    gap = min(gap_ahead, gap_behind)
    if math.isnan(gap):
        return 10.0
    return round(float(np.clip(gap, 0.0, 30.0)), 2)


# ---------------------------------------------------------------------------
# 5. High-Signal Feature Vector Extraction APIs
# ---------------------------------------------------------------------------

def extract_overtake_features(
    att: dict,
    dfnd: dict,
    att_code: str = "",
    dfnd_code: str = "",
    circuit_len: float = 5807.0,
    driver_history: Optional[Dict[str, Any]] = None,
    driver_states: Optional[Dict[str, DriverTelemetryState]] = None,
    track_geometry: Optional[Any] = None,
    braking_zones: Optional[List[float]] = None,
    clean_pace_map: Optional[Dict[str, float]] = None,
    laps_df: Optional[pd.DataFrame] = None,
) -> Tuple[pd.DataFrame, float, float, int]:
    """
    Extracts the unified high-signal overtake feature vector (OVERTAKE_FEATURE_COLUMNS).
    Maintains strict parity with offline dataset mining.
    """
    frac_att = float(att.get("fraction", 0.0))
    frac_dfnd = float(dfnd.get("fraction", 0.0))
    delta_frac = (frac_dfnd - frac_att) % 1.0

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
    drs_active = 1 if (raw_drs >= 10 or raw_drs in (1, 2, 12, 14)) else 0

    # Driver Control Commitment: throttle jerk & braking onset delta
    if driver_states and att_code in driver_states:
        state = driver_states[att_code]
        mean_throttle = state.mean_throttle
        throttle_jerk = state.throttle_jerk
        mean_brake = state.mean_brake
        brake_onset_delta = state.brake_onset_delta
    elif driver_history and att_code in driver_history:
        att_hist = driver_history[att_code]
        if len(att_hist) >= 2:
            throttles = [
                float(s.get("throttle", s[2]) if isinstance(s, dict) else s[2])
                for s in att_hist
            ]
            brakes = [
                float(s.get("brake", s[3]) if isinstance(s, dict) else s[3])
                for s in att_hist
            ]
            th_scaled = [t * 100.0 if (0.0 < t <= 1.0) else t for t in throttles]
            brk_scaled = [1.0 if b > 0.0 else 0.0 for b in brakes]
            mean_throttle = float(np.mean(th_scaled))
            mean_brake = float(np.mean(brk_scaled))
            throttle_jerk = float((th_scaled[-1] - th_scaled[-2]) / 0.04)
            brake_onset_delta = float((brk_scaled[-1] - brk_scaled[-2]) / 0.04)
        else:
            raw_th = float(att.get("throttle", 0.0))
            mean_throttle = raw_th * 100.0 if (0.0 < raw_th <= 1.0) else raw_th
            throttle_jerk = 0.0
            mean_brake = 1.0 if float(att.get("brake", 0.0)) > 0.0 else 0.0
            brake_onset_delta = 0.0
    else:
        raw_th = float(att.get("throttle", 0.0))
        mean_throttle = raw_th * 100.0 if (0.0 < raw_th <= 1.0) else raw_th
        throttle_jerk = 0.0
        mean_brake = 1.0 if float(att.get("brake", 0.0)) > 0.0 else 0.0
        brake_onset_delta = 0.0

    tyre_age_delta = float(att.get("tyre_life", 0.0)) - float(dfnd.get("tyre_life", 0.0))

    c_att = int(round(float(att.get("tyre", 1.0))))
    c_dfnd = int(round(float(dfnd.get("tyre", 1.0))))
    compound_delta = float(COMPOUND_GRIP_SCORE.get(c_att, 0.0) - COMPOUND_GRIP_SCORE.get(c_dfnd, 0.0))

    # Clean-Air Pace Differential
    current_lap = int(att.get("lap", 1))
    if laps_df is not None and not laps_df.empty and att_code and dfnd_code:
        drv_col = "Driver" if "Driver" in laps_df.columns else "driver"
        att_laps = laps_df[laps_df[drv_col] == att_code]
        dfnd_laps = laps_df[laps_df[drv_col] == dfnd_code]
        clean_air_pace_diff = compute_clean_air_pace_diff(att_laps, dfnd_laps, current_lap)
    elif clean_pace_map and att_code in clean_pace_map and dfnd_code in clean_pace_map:
        clean_air_pace_diff = round(float(clean_pace_map[att_code] - clean_pace_map[dfnd_code]), 4)
    else:
        clean_air_pace_diff = 0.0

    # Track Topology & Braking Zone Proximity
    dist_att = float(att.get("dist", frac_att * circuit_len))
    dist_to_next_heavy_braking = compute_distance_to_next_heavy_braking(dist_att, braking_zones, circuit_len)

    centerline = getattr(track_geometry, "centerline", None) if track_geometry else None
    if centerline is not None and len(centerline) >= 3:
        k_arr = compute_track_curvature(centerline)
        k_idx = int(((dist_att % circuit_len) / circuit_len) * len(k_arr)) % len(k_arr)
        curvature = float(k_arr[k_idx])
    else:
        k_arr = None
        curvature = 0.0

    straight_fraction_remaining = compute_straight_fraction_remaining(
        dist_m=dist_att,
        circuit_length=circuit_len,
        centerline=centerline,
        curvature_array=k_arr,
        braking_zones=braking_zones,
    )

    row_data = {
        "delta_s": delta_s,
        "delta_v": delta_v,
        "euclidean_dist": euclidean_dist,
        "drs_active": drs_active,
        "mean_throttle": mean_throttle,
        "throttle_jerk": throttle_jerk,
        "mean_brake": mean_brake,
        "brake_onset_delta": brake_onset_delta,
        "tyre_age_delta": tyre_age_delta,
        "compound_delta": compound_delta,
        "clean_air_pace_diff": clean_air_pace_diff,
        "dist_to_next_heavy_braking": dist_to_next_heavy_braking,
        "straight_fraction_remaining": straight_fraction_remaining,
        "curvature": curvature,
    }

    feature_vector = pd.DataFrame([row_data], columns=OVERTAKE_FEATURE_COLUMNS)
    return feature_vector, delta_s, delta_v, drs_active


def extract_pit_features(
    att: dict,
    track_status: str = "1",
    driver_laps: Optional[pd.DataFrame] = None,
    all_laps: Optional[pd.DataFrame] = None,
    current_lap: Optional[int] = None,
    stint_start_lap: int = 1,
    driver_code: str = "",
) -> Tuple[pd.DataFrame, int, float]:
    """
    Extracts the unified high-signal pit anticipation feature vector (PIT_FEATURE_COLUMNS).
    Maintains strict parity with offline dataset mining.
    """
    tyre_life = int(att.get("tyre_life", 0))
    tyre_compound = float(att.get("tyre", 1.0))
    lap_number = int(att.get("lap", current_lap or 1))

    status_str = str(track_status)
    sc_active = 1 if status_str == "4" else 0
    vsc_active = 1 if status_str in ("6", "7") else 0

    stint_progression_ratio = compute_stint_progression_ratio(tyre_life, tyre_compound)

    if driver_laps is not None and not driver_laps.empty:
        fuel_corrected_degradation_slope = compute_fuel_corrected_degradation_slope(
            driver_laps, lap_number, stint_start_lap
        )
    else:
        # Default degradation slope based on compound if laps unavailable
        fuel_corrected_degradation_slope = {0: 0.05, 1: 0.03, 2: 0.015}.get(int(round(tyre_compound)), 0.03)

    pit_loss_delta = compute_pit_loss_delta(status_str)

    if all_laps is not None and not all_laps.empty and driver_code:
        traffic_rejoin_gap = compute_traffic_rejoin_gap(
            driver_code, lap_number, all_laps, pit_loss_sec=PIT_LOSS_GREEN_SEC - pit_loss_delta
        )
    else:
        traffic_rejoin_gap = 10.0

    row_data = {
        "tyre_life": tyre_life,
        "tyre_compound": tyre_compound,
        "stint_progression_ratio": stint_progression_ratio,
        "fuel_corrected_degradation_slope": fuel_corrected_degradation_slope,
        "pit_loss_delta": pit_loss_delta,
        "traffic_rejoin_gap": traffic_rejoin_gap,
        "sc_active": sc_active,
        "vsc_active": vsc_active,
        "lap_number": lap_number,
    }

    feature_vector = pd.DataFrame([row_data], columns=PIT_FEATURE_COLUMNS)
    return feature_vector, tyre_life, tyre_compound
