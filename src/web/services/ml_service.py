"""
ML Service: Precomputes session-wide predictive timelines for overtake likelihood,
pit anticipation, and Bayesian tyre degradation.
"""

import logging
import math
from typing import Callable, Dict, List, Optional, Tuple, Any
import numpy as np
import pandas as pd

from src.ml.registry import ModelRegistry, DEFAULT_METADATA
from src.ml.features import (
    extract_overtake_features,
    extract_pit_features,
    compute_track_curvature,
    compute_distance_to_next_heavy_braking,
    compute_straight_fraction_remaining,
    compute_rolling_clean_air_pace,
    compute_fuel_corrected_degradation_slope,
    compute_pit_loss_delta,
    compute_traffic_rejoin_gap,
    standardize_laps_dataframe,
    OVERTAKE_FEATURE_COLUMNS,
    PIT_FEATURE_COLUMNS,
    EXPECTED_COMPOUND_LIFE,
    COMPOUND_GRIP_SCORE,
)
from src.ml.mining import find_heavy_braking_zones
from src.ml.overtake import OvertakeModel
from src.ml.pit import PitModel
from src.ml.tyre import TyreDegradationEstimator
from src.web.schemas.ml import (
    MlBattleSegment,
    MlDriverPitTimeline,
    MlDriverTyreTimeline,
    MlModelMetadata,
    MlTimelines,
)
from src.web.schemas.track import TrackGeometry
from src.web.schemas.laps import LapRow, Stint
from src.web.services.frame_store import FrameStore, FPS, REFERENCE_SPEED_MPS

logger = logging.getLogger(__name__)

# Sampling parameters for precomputed timelines
SAMPLE_HZ = 2.0  # 2 Hz = 0.5s resolution
STEP_FRAMES = int(FPS / SAMPLE_HZ)  # 12 or 13 frames at 25 FPS
MAX_BATTLE_GAP_SEC = 3.0
MAX_BATTLE_GAP_METERS = MAX_BATTLE_GAP_SEC * REFERENCE_SPEED_MPS  # ~166 meters


class MlService:
    """Computes session-wide predictive ML timelines at load time."""

    def __init__(self):
        self.registry = ModelRegistry.get_instance()
        self.overtake_model = OvertakeModel()
        self.pit_model = PitModel()
        self.tyre_estimator = TyreDegradationEstimator()

    def compute_ml_timelines(
        self,
        sid: str,
        frame_store: FrameStore,
        laps: List[LapRow],
        stints: List[Stint],
        track: Optional[TrackGeometry] = None,
        total_laps: int = 53,
        progress_cb: Optional[Callable[[str, float, str], None]] = None,
    ) -> MlTimelines:
        """
        Computes all predictive timelines (overtake battles, pit anticipation, tyre wear)
        in a single vectorized pass.
        """
        num_frames = frame_store.total_frames
        driver_codes = frame_store.driver_codes
        num_drivers = len(driver_codes)
        drv_map = {c: i for i, c in enumerate(driver_codes)}

        circuit_len = 5807.0
        if track and track.length_m:
            circuit_len = float(track.length_m)

        # Step 1: Precompute Tyre Degradation (fast per-driver per-lap)
        if progress_cb:
            progress_cb("computing_ml", 0.88, "Computing Bayesian tyre degradation models...")

        tyre_timelines: Dict[str, MlDriverTyreTimeline] = {}
        lap_dicts = [l.model_dump(by_alias=True) for l in laps]
        stint_dicts = [s.model_dump(by_alias=True) for s in stints]

        # Fit session-wide Bayesian tyre degradation model
        laps_df = pd.DataFrame(lap_dicts)
        if not laps_df.empty:
            self.tyre_estimator.fit(laps_df)

        for code in driver_codes:
            t_data = self.tyre_estimator.compute_driver_tyre_timeline(
                code, lap_dicts, stint_dicts, total_laps
            )
            tyre_timelines[code] = MlDriverTyreTimeline(
                driver=code,
                laps=t_data["laps"],
                degradation_s_per_lap=t_data["degradationSPerLap"],
                pace_loss_s=t_data["paceLossS"],
                projected_degradation=t_data["projectedDegradation"],
                credible_interval_lower=t_data.get("credibleIntervalLower"),
                credible_interval_upper=t_data.get("credibleIntervalUpper"),
                projected_credible_interval_lower=t_data.get("projectedCredibleIntervalLower"),
                projected_credible_interval_upper=t_data.get("projectedCredibleIntervalUpper"),
            )

        # Step 2: Sampling loop for Pit Anticipation and Overtake Battles
        if progress_cb:
            progress_cb("computing_ml", 0.92, "Simulating overtake likelihood & pit windows...")

        sample_indices = np.array(list(range(0, num_frames, STEP_FRAMES)))
        num_samples = len(sample_indices)
        dt = float(STEP_FRAMES / FPS)

        channels = frame_store.channels
        dist_arr = channels["dist"]
        speed_arr = channels["speed"]
        throttle_arr = channels["throttle"]
        brake_arr = channels["brake"]
        drs_arr = channels["drs"]
        x_arr = channels["x"]
        y_arr = channels["y"]
        pos_arr = channels["position"]
        in_pit_arr = channels["inPit"]
        status_arr = channels["status"]
        track_status_arr = channels["trackStatus"]
        tyre_life_arr = channels["tyreLife"]
        tyre_arr = channels["tyre"]
        lap_arr = channels["lap"]

        # -------------------------------------------------------------
        # 2a. Vectorized Pit Anticipation (Fast multi-threaded CPU)
        # -------------------------------------------------------------
        if progress_cb:
            progress_cb("computing_ml", 0.94, "Simulating pit anticipation windows...")

        sub_status = status_arr[:, sample_indices]
        sub_in_pit = in_pit_arr[:, sample_indices]
        on_track_mask = (sub_status == 0) & (sub_in_pit == 0)

        sub_tyre_life = tyre_life_arr[:, sample_indices].astype(np.float32)
        sub_tyre = tyre_arr[:, sample_indices].astype(np.float32)
        sub_lap = lap_arr[:, sample_indices].astype(np.float32)

        sub_track_status = track_status_arr[sample_indices]
        sc_active = np.tile((sub_track_status == 4).astype(np.float32), (num_drivers, 1))
        vsc_active = np.tile(((sub_track_status == 6) | (sub_track_status == 7)).astype(np.float32), (num_drivers, 1))

        # High-signal pit strategy features:
        # 1. Stint progression ratio
        compound_limits = np.array([
            EXPECTED_COMPOUND_LIFE.get(int(round(c)), 28.0) if c <= 4 else 28.0
            for c in sub_tyre.flat
        ]).reshape(sub_tyre.shape).astype(np.float32)
        sub_progression = np.clip(sub_tyre_life / np.maximum(compound_limits, 1.0), 0.0, 2.5).astype(np.float32)

        # 2. Neutralization pit loss delta
        loss_deltas_1d = np.array([compute_pit_loss_delta(int(s)) for s in sub_track_status], dtype=np.float32)
        sub_loss_delta = np.tile(loss_deltas_1d, (num_drivers, 1))

        # 3. Fuel-corrected degradation slope & traffic rejoin gap from laps
        deg_slope_map: Dict[Tuple[str, int], float] = {}
        rejoin_gap_map: Dict[Tuple[str, int], float] = {}
        stint_start_map: Dict[Tuple[str, int], int] = {}
        if stints:
            for s in stints:
                drv = s.driver
                for l_num in range(s.lap_start, s.lap_end + 1):
                    stint_start_map[(drv, l_num)] = s.lap_start

        standardized_laps_df = None
        if laps:
            raw_laps_df = pd.DataFrame([l.model_dump() for l in laps])
            standardized_laps_df = standardize_laps_dataframe(raw_laps_df)
            drv_col = "Driver" if "Driver" in standardized_laps_df.columns else "driver"
            for d_idx, code in enumerate(driver_codes):
                drv_laps = standardized_laps_df[standardized_laps_df[drv_col] == code]
                for l_num in range(1, total_laps + 1):
                    stint_start = stint_start_map.get((code, l_num), 1)
                    slope = compute_fuel_corrected_degradation_slope(drv_laps, l_num, stint_start)
                    deg_slope_map[(code, l_num)] = slope
                    gap = compute_traffic_rejoin_gap(code, l_num, standardized_laps_df)
                    rejoin_gap_map[(code, l_num)] = gap

        sub_deg_slope = np.zeros((num_drivers, num_samples), dtype=np.float32)
        sub_rejoin_gap = np.full((num_drivers, num_samples), 10.0, dtype=np.float32)

        for d_idx, code in enumerate(driver_codes):
            for s_idx in range(num_samples):
                l_num = int(sub_lap[d_idx, s_idx])
                sub_deg_slope[d_idx, s_idx] = deg_slope_map.get((code, l_num), 0.03)
                sub_rejoin_gap[d_idx, s_idx] = rejoin_gap_map.get((code, l_num), 10.0)

        # Features order matching PIT_FEATURE_COLUMNS
        features_pit = np.stack([
            sub_tyre_life, sub_tyre, sub_progression, sub_deg_slope,
            sub_loss_delta, sub_rejoin_gap, sc_active, vsc_active, sub_lap
        ], axis=-1)
        flat_pit_features = features_pit.reshape(-1, len(PIT_FEATURE_COLUMNS))
        df_pit = pd.DataFrame(flat_pit_features, columns=PIT_FEATURE_COLUMNS)

        if self.pit_model.model is not None:
            try:
                if hasattr(self.pit_model.model, "feature_names_in_"):
                    cols = [c for c in self.pit_model.model.feature_names_in_ if c in df_pit.columns]
                    if len(cols) == len(self.pit_model.model.feature_names_in_):
                        probs_raw = self.pit_model.model.predict_proba(df_pit[cols])[:, 1]
                    else:
                        probs_raw = self.pit_model.model.predict_proba(df_pit)[:, 1]
                else:
                    probs_raw = self.pit_model.model.predict_proba(df_pit)[:, 1]
                probs_2d = probs_raw.reshape(num_drivers, num_samples)
                probs_clipped = np.clip(probs_2d, 0.01, 0.98)
                probs_final = np.where(on_track_mask, probs_clipped, 0.01)
            except Exception:
                probs_final = np.full((num_drivers, num_samples), 0.01, dtype=np.float32)
        else:
            probs_final = np.full((num_drivers, num_samples), 0.01, dtype=np.float32)

        pit_probs: Dict[str, List[float]] = {}
        for d_idx, code in enumerate(driver_codes):
            pit_probs[code] = [round(float(p), 3) for p in probs_final[d_idx]]

        # -------------------------------------------------------------
        # 2b. Overtake Candidate Extraction & Batched Inference (CPU)
        # -------------------------------------------------------------
        if progress_cb:
            progress_cb("computing_ml", 0.97, "Simulating track battles & overtake likelihood...")

        # Detect heavy braking zones and precompute track curvature
        braking_zones = find_heavy_braking_zones(dist_arr[0], speed_arr[0], brake_arr[0], circuit_len)

        curvature_arr = None
        if track and getattr(track, "centerline", None) and len(track.centerline) >= 3:
            curvature_arr = compute_track_curvature(track.centerline)

        clean_pace_by_driver_lap: Dict[Tuple[str, int], float] = {}
        if standardized_laps_df is not None:
            drv_col = "Driver" if "Driver" in standardized_laps_df.columns else "driver"
            for code in driver_codes:
                drv_laps = standardized_laps_df[standardized_laps_df[drv_col] == code]
                for l_num in range(1, total_laps + 1):
                    clean_pace_by_driver_lap[(code, l_num)] = compute_rolling_clean_air_pace(drv_laps, l_num)

        max_th = float(np.nanmax(throttle_arr)) if throttle_arr.size > 0 else 100.0
        th_scale = 100.0 if (0.0 < max_th <= 1.0) else 1.0

        candidates_by_sample: List[List[dict]] = [[] for _ in range(num_samples)]
        all_ot_feature_rows: List[List[float]] = []

        for s_idx, f in enumerate(sample_indices):
            active_drvs = [
                i for i in range(num_drivers)
                if status_arr[i, f] == 0 and in_pit_arr[i, f] == 0
            ]
            if len(active_drvs) < 2:
                continue

            has_pos = all(pos_arr[i, f] > 0 for i in active_drvs)
            if has_pos:
                ordered_drvs = sorted(active_drvs, key=lambda i: (pos_arr[i, f], -dist_arr[i, f]))
            else:
                ordered_drvs = sorted(active_drvs, key=lambda i: dist_arr[i, f], reverse=True)

            for p in range(len(ordered_drvs) - 1):
                ahead_idx = ordered_drvs[p]
                behind_idx = ordered_drvs[p + 1]

                d_ahead = float(dist_arr[ahead_idx, f])
                d_behind = float(dist_arr[behind_idx, f])

                gap_meters = d_ahead - d_behind
                if gap_meters < 0:
                    gap_meters = (gap_meters + circuit_len) % circuit_len

                time_gap_sec = gap_meters / REFERENCE_SPEED_MPS

                if gap_meters <= MAX_BATTLE_GAP_METERS or time_gap_sec <= MAX_BATTLE_GAP_SEC:
                    att_code = driver_codes[behind_idx]
                    def_code = driver_codes[ahead_idx]

                    frac_att = (d_behind % circuit_len) / circuit_len
                    frac_dfnd = (d_ahead % circuit_len) / circuit_len
                    delta_frac = (frac_dfnd - frac_att) % 1.0
                    if delta_frac > 0.5:
                        delta_frac -= 1.0
                    delta_s = delta_frac * circuit_len

                    speed_att = float(speed_arr[behind_idx, f])
                    speed_dfnd = float(speed_arr[ahead_idx, f])
                    delta_v = speed_att - speed_dfnd

                    x_att = float(x_arr[behind_idx, f]) if not np.isnan(x_arr[behind_idx, f]) else 0.0
                    y_att = float(y_arr[behind_idx, f]) if not np.isnan(y_arr[behind_idx, f]) else 0.0
                    x_dfnd = float(x_arr[ahead_idx, f]) if not np.isnan(x_arr[ahead_idx, f]) else 0.0
                    y_dfnd = float(y_arr[ahead_idx, f]) if not np.isnan(y_arr[ahead_idx, f]) else 0.0

                    dx = x_dfnd - x_att
                    dy = y_dfnd - y_att
                    euclidean_dist = float(np.sqrt(dx * dx + dy * dy))

                    raw_drs = int(drs_arr[behind_idx, f])
                    drs_active = 1 if (raw_drs >= 10 or raw_drs in (1, 2, 12, 14)) else 0

                    # Throttle & Brake statistics over trailing 3 seconds with uniform scale
                    w = slice(max(0, f - int(3.0 * FPS)), f + 1)
                    raw_th_w = throttle_arr[behind_idx, w]
                    th_recent = raw_th_w * th_scale
                    mean_throttle = float(np.mean(th_recent)) if len(th_recent) > 0 else 0.0

                    # Instantaneous throttle jerk dThrottle/dt between adjacent frames
                    th_curr = throttle_arr[behind_idx, f] * th_scale
                    th_prev = throttle_arr[behind_idx, max(0, f - 1)] * th_scale
                    throttle_jerk = float((th_curr - th_prev) / (1.0 / FPS)) if f > 0 else 0.0

                    raw_brk_w = brake_arr[behind_idx, w]
                    brk_recent = (raw_brk_w > 0.0).astype(float)
                    mean_brake = float(np.mean(brk_recent)) if len(brk_recent) > 0 else 0.0

                    # Instantaneous braking onset delta between adjacent frames
                    brk_curr = 1.0 if brake_arr[behind_idx, f] > 0.0 else 0.0
                    brk_prev = 1.0 if brake_arr[behind_idx, max(0, f - 1)] > 0.0 else 0.0
                    brake_onset_delta = float((brk_curr - brk_prev) / (1.0 / FPS)) if f > 0 else 0.0

                    tyre_age_delta = float(tyre_life_arr[behind_idx, f]) - float(tyre_life_arr[ahead_idx, f])
                    c_att = int(tyre_arr[behind_idx, f])
                    c_dfnd = int(tyre_arr[ahead_idx, f])
                    compound_delta = float(COMPOUND_GRIP_SCORE.get(c_att, 0.0) - COMPOUND_GRIP_SCORE.get(c_dfnd, 0.0))

                    lap_att = int(lap_arr[behind_idx, f])
                    lap_dfnd = int(lap_arr[ahead_idx, f])
                    p_att = clean_pace_by_driver_lap.get((att_code, lap_att), 90.0)
                    p_dfnd = clean_pace_by_driver_lap.get((def_code, lap_dfnd), 90.0)
                    if p_att == 90.0 or p_dfnd == 90.0:
                        clean_air_pace_diff = 0.0
                    else:
                        clean_air_pace_diff = round(float(p_att - p_dfnd), 4)

                    dist_to_next_heavy_braking = compute_distance_to_next_heavy_braking(d_behind, braking_zones, circuit_len)

                    if curvature_arr is not None and len(curvature_arr) >= 3:
                        k_idx = int(((d_behind % circuit_len) / circuit_len) * len(curvature_arr)) % len(curvature_arr)
                        curvature = float(curvature_arr[k_idx])
                    else:
                        curvature = 0.0

                    straight_fraction_remaining = compute_straight_fraction_remaining(
                        dist_m=d_behind,
                        circuit_length=circuit_len,
                        centerline=track.centerline if track else None,
                        curvature_array=curvature_arr,
                        braking_zones=braking_zones,
                    )

                    feat_idx = len(all_ot_feature_rows)
                    # Matching OVERTAKE_FEATURE_COLUMNS
                    all_ot_feature_rows.append([
                        delta_s, delta_v, euclidean_dist, drs_active,
                        mean_throttle, throttle_jerk, mean_brake, brake_onset_delta,
                        tyre_age_delta, compound_delta, clean_air_pace_diff,
                        dist_to_next_heavy_braking, straight_fraction_remaining, curvature
                    ])

                    candidates_by_sample[s_idx].append({
                        "attacker": att_code,
                        "defender": def_code,
                        "gapMeters": round(gap_meters, 1),
                        "closingSpeedKmh": round(delta_v, 1),
                        "featIdx": feat_idx,
                        "delta_s": delta_s,
                        "delta_v": delta_v,
                        "drs_active": drs_active,
                        "tyre_age_delta": tyre_age_delta,
                        "clean_air_pace_diff": clean_air_pace_diff,
                        "dist_to_next_heavy_braking": dist_to_next_heavy_braking,
                    })

        # Batched inference for all candidates across replay (CPU)
        if all_ot_feature_rows and self.overtake_model.model is not None:
            df_ot = pd.DataFrame(all_ot_feature_rows, columns=OVERTAKE_FEATURE_COLUMNS)
            try:
                if hasattr(self.overtake_model.model, "feature_name_"):
                    cols = [c for c in self.overtake_model.model.feature_name_ if c in df_ot.columns]
                    if len(cols) == len(self.overtake_model.model.feature_name_):
                        ot_probs_raw = self.overtake_model.model.predict_proba(df_ot[cols])[:, 1]
                    else:
                        ot_probs_raw = self.overtake_model.model.predict_proba(df_ot)[:, 1]
                else:
                    ot_probs_raw = self.overtake_model.model.predict_proba(df_ot)[:, 1]
                ot_probs_all = np.clip(ot_probs_raw, 0.01, 0.99)
            except Exception:
                ot_probs_all = np.full(len(all_ot_feature_rows), 0.01, dtype=np.float32)
        else:
            ot_probs_all = np.array([], dtype=np.float32)

        # -------------------------------------------------------------
        # 2c. State Machine to Reconstruct Battle Segments
        # -------------------------------------------------------------
        active_battles: Dict[Tuple[str, str], dict] = {}
        completed_battles: List[MlBattleSegment] = []

        for s_idx, f in enumerate(sample_indices):
            t_sec = float(f / FPS)
            current_frame_pairs = set()

            for cand in candidates_by_sample[s_idx]:
                att_code = cand["attacker"]
                def_code = cand["defender"]
                pair_key = (att_code, def_code)
                current_frame_pairs.add(pair_key)

                ot_prob = float(ot_probs_all[cand["featIdx"]])
                prob_rounded = round(ot_prob, 3)

                explain_dict = {
                    "delta_s": cand["delta_s"],
                    "delta_v": cand["delta_v"],
                    "drs_active": cand["drs_active"],
                    "tyre_age_delta": cand["tyre_age_delta"],
                    "clean_air_pace_diff": cand.get("clean_air_pace_diff", 0.0),
                    "dist_to_next_heavy_braking": cand.get("dist_to_next_heavy_braking", 999.0),
                }

                if pair_key not in active_battles:
                    active_battles[pair_key] = {
                        "attacker": att_code,
                        "defender": def_code,
                        "t0": round(t_sec, 2),
                        "dt": round(dt, 3),
                        "probabilities": [prob_rounded],
                        "gapMeters": [cand["gapMeters"]],
                        "closingSpeedKmh": [cand["closingSpeedKmh"]],
                        "lastSampleIdx": s_idx,
                        "explainDict": explain_dict,
                    }
                else:
                    battle = active_battles[pair_key]
                    battle["probabilities"].append(prob_rounded)
                    battle["gapMeters"].append(cand["gapMeters"])
                    battle["closingSpeedKmh"].append(cand["closingSpeedKmh"])
                    battle["lastSampleIdx"] = s_idx
                    if ot_prob > max(battle["probabilities"][:-1] or [0]):
                        battle["explainDict"] = explain_dict

            # Close battles that were not updated in this frame
            closed_keys = []
            for pair_key, battle in active_battles.items():
                if pair_key not in current_frame_pairs:
                    expl = self.overtake_model.explain(battle["explainDict"])
                    completed_battles.append(
                        MlBattleSegment(
                            attacker=battle["attacker"],
                            defender=battle["defender"],
                            t0=battle["t0"],
                            dt=battle["dt"],
                            probabilities=battle["probabilities"],
                            gap_meters=battle["gapMeters"],
                            closing_speed_kmh=battle["closingSpeedKmh"],
                            contributions=expl,
                        )
                    )
                    closed_keys.append(pair_key)

            for k in closed_keys:
                del active_battles[k]

        # Finalize any remaining active battles
        for battle in active_battles.values():
            expl = self.overtake_model.explain(battle["explainDict"])
            completed_battles.append(
                MlBattleSegment(
                    attacker=battle["attacker"],
                    defender=battle["defender"],
                    t0=battle["t0"],
                    dt=battle["dt"],
                    probabilities=battle["probabilities"],
                    gap_meters=battle["gapMeters"],
                    closing_speed_kmh=battle["closingSpeedKmh"],
                    contributions=expl,
                )
            )

        # Filter out negligible noise battles (< 3 samples and peak prob < 0.15)
        filtered_battles = [
            b for b in completed_battles
            if len(b.probabilities) >= 3 or max(b.probabilities or [0]) >= 0.15
        ]

        # Format pit timelines
        pit_timelines: Dict[str, MlDriverPitTimeline] = {}
        for code in driver_codes:
            pit_timelines[code] = MlDriverPitTimeline(
                driver=code,
                t0=0.0,
                dt=round(dt, 3),
                probabilities=pit_probs[code],
            )

        model_meta = MlModelMetadata(
            name=DEFAULT_METADATA.name,
            version=DEFAULT_METADATA.version,
            trained_on=DEFAULT_METADATA.trained_on,
            note=DEFAULT_METADATA.note,
            is_synthetic=DEFAULT_METADATA.is_synthetic,
        )

        return MlTimelines(
            session_id=sid,
            model=model_meta,
            battles=filtered_battles,
            pit=pit_timelines,
            tyre=tyre_timelines,
        )


ml_service = MlService()
