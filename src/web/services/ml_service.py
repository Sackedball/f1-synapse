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
from src.ml.features import extract_overtake_features, extract_pit_features
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

        # Features order: ['tyre_life', 'tyre_compound', 'sc_active', 'vsc_active', 'lap_number']
        features_pit = np.stack([sub_tyre_life, sub_tyre, sc_active, vsc_active, sub_lap], axis=-1)
        flat_pit_features = features_pit.reshape(-1, 5)

        if self.pit_model.model is not None:
            try:
                probs_raw = self.pit_model.model.predict_proba(flat_pit_features)[:, 1]
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
                    drs_active = 1 if (raw_drs >= 10 or raw_drs == 2) else 0

                    mean_throttle = float(throttle_arr[behind_idx, f])
                    throttle_jerk = 0.0
                    mean_brake = float(brake_arr[behind_idx, f])
                    tyre_age_delta = float(tyre_life_arr[behind_idx, f]) - float(tyre_life_arr[ahead_idx, f])

                    feat_idx = len(all_ot_feature_rows)
                    all_ot_feature_rows.append([
                        delta_s, delta_v, euclidean_dist, drs_active,
                        mean_throttle, throttle_jerk, mean_brake, tyre_age_delta
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
                    })

        # Batched inference for all candidates across replay (CPU)
        if all_ot_feature_rows and self.overtake_model.model is not None:
            feature_cols = [
                "delta_s", "delta_v", "euclidean_dist", "drs_active",
                "mean_throttle", "throttle_jerk", "mean_brake", "tyre_age_delta"
            ]
            df_ot = pd.DataFrame(all_ot_feature_rows, columns=feature_cols)
            try:
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
