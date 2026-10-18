"""
Real Ground-Truth Data Mining Pipeline for F1 Synapse ML models.
Mines historical FastF1 telemetry and session records to extract:
1. Overtake Dataset: car-following candidate pairs with continuous physics features
   and ground-truth binary labels (stable position flip vs sustained defense).
2. Pit Stop Dataset: discrete-time hazard labels (Y_L+1, Y_L+2, Y_L+3) with tyre life,
   progression ratio, fuel-corrected degradation slope, pit-loss delta, and traffic rejoin gap.

Pure Python, NumPy, SciPy, Pandas, FastF1. Zero GUI dependencies.
"""

import math
import os
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, Union
import numpy as np
import pandas as pd
import fastf1

from src.lib.settings import get_settings
from src.lib.tyres import get_tyre_compound_int
from src.ml.features import (
    compute_track_curvature,
    compute_distance_to_next_heavy_braking,
    compute_straight_fraction_remaining,
    compute_clean_air_pace_diff,
    compute_rolling_clean_air_pace,
    standardize_laps_dataframe,
    OVERTAKE_FEATURE_COLUMNS,
    PIT_FEATURE_COLUMNS,
)


# Standard F1 physical and operational constants
DEFAULT_FPS = 5  # Resampling frequency for offline mining (5 Hz provides optimal balance)
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
FUEL_BURN_SEC_PER_LAP = 0.045  # Lap time advantage gained per lap from fuel burn (seconds/lap)
PIT_LOSS_GREEN_SEC = 22.0     # Nominal pit stop loss under green flag conditions
PIT_LOSS_VSC_SEC = 13.5       # Pit stop loss under Virtual Safety Car
PIT_LOSS_SC_SEC = 10.0        # Pit stop loss under full Safety Car


def ensure_fastf1_cache(cache_dir: Optional[Union[str, Path]] = None) -> Path:
    """Configures FastF1 disk cache properly."""
    if cache_dir is None:
        settings = get_settings()
        cache_dir = settings.cache_location or ".fastf1-cache"
    
    cache_path = Path(cache_dir).resolve()
    cache_path.mkdir(parents=True, exist_ok=True)
    fastf1.Cache.enable_cache(str(cache_path))
    return cache_path


# ---------------------------------------------------------------------------
# 1. Feature Engineering & Kinematic Helpers
# ---------------------------------------------------------------------------

def find_heavy_braking_zones(
    dist_array: np.ndarray,
    speed_array: np.ndarray,
    brake_array: np.ndarray,
    circuit_length: float,
    speed_threshold_kmh: float = 160.0,
    brake_threshold: float = 0.4,
    min_zone_separation_m: float = 120.0,
) -> List[float]:
    """
    Identifies track distance coordinates (in [0, circuit_length)) where heavy
    braking initiates from high speed.
    """
    min_len = min(len(dist_array), len(speed_array), len(brake_array))
    if min_len < 2 or circuit_length <= 0:
        return []

    d = dist_array[:min_len]
    s = speed_array[:min_len]
    b = brake_array[:min_len]

    # Onset of hard braking: brake crosses threshold and speed is high
    brake_onset = (
        (b[1:] >= brake_threshold)
        & (b[:-1] < brake_threshold)
        & (s[:-1] >= speed_threshold_kmh)
    )
    onset_indices = np.where(brake_onset)[0] + 1
    if len(onset_indices) == 0:
        return []

    raw_zone_positions = (d[onset_indices] % circuit_length).tolist()
    raw_zone_positions.sort()

    # Cluster braking points within min_zone_separation_m
    merged_zones: List[float] = []
    current_cluster: List[float] = [raw_zone_positions[0]]

    for pos in raw_zone_positions[1:]:
        if pos - current_cluster[-1] <= min_zone_separation_m:
            current_cluster.append(pos)
        else:
            merged_zones.append(float(np.mean(current_cluster)))
            current_cluster = [pos]

    if current_cluster:
        merged_zones.append(float(np.mean(current_cluster)))

    # Handle circular wrap-around near start/finish boundary
    if len(merged_zones) >= 2:
        wrap_gap = (circuit_length - merged_zones[-1]) + merged_zones[0]
        if wrap_gap <= min_zone_separation_m:
            merged_first = float((merged_zones[-1] + merged_zones[0] + circuit_length) / 2.0 % circuit_length)
            merged_zones = [merged_first] + merged_zones[1:-1]

    return merged_zones


def compute_braking_proximity(
    dist_m: float,
    braking_zones: List[float],
    circuit_length: float,
    decay_constant_m: float = 100.0,
) -> Tuple[float, float]:
    """
    Calculates distance to next heavy braking zone ahead and continuous proximity metric in [0, 1].
    Returns (dist_to_next_braking_m, proximity_score).
    """
    if not braking_zones or circuit_length <= 0:
        return 999.0, 0.0

    s_norm = dist_m % circuit_length
    deltas = [(bz - s_norm) % circuit_length for bz in braking_zones]
    dist_to_next = float(min(deltas))
    decay_const = max(float(decay_constant_m), 1.0)
    proximity = float(np.exp(-dist_to_next / decay_const))
    return round(dist_to_next, 2), round(proximity, 4)


def compute_driver_clean_air_pace(laps_df: pd.DataFrame, min_laps: int = 2) -> Dict[str, float]:
    """
    Estimates baseline vehicle pace in clean air for each driver (median lap time in seconds).
    Filters for green-flag flying laps without pit-ins or pit-outs.
    """
    clean_pace_map: Dict[str, float] = {}
    if laps_df is None or laps_df.empty:
        return clean_pace_map

    df = standardize_laps_dataframe(laps_df)
    if df.empty or "Driver" not in df.columns:
        return clean_pace_map

    # Filter for representative green laps
    mask = pd.Series(True, index=df.index)
    if "TrackStatus" in df.columns:
        mask &= (df["TrackStatus"].astype(str) == "1")
    if "PitInTime" in df.columns:
        mask &= df["PitInTime"].isna()
    if "PitOutTime" in df.columns:
        mask &= df["PitOutTime"].isna()
    if "LapTime" in df.columns:
        mask &= df["LapTime"].notna()
    if "IsAccurate" in df.columns:
        # Keep accurate laps if present
        acc_mask = df["IsAccurate"].fillna(True).astype(bool)
        if acc_mask.any():
            mask &= acc_mask

    clean_laps = df[mask]

    for drv, df_drv in clean_laps.groupby("Driver"):
        lap_times = df_drv["LapTime"].dt.total_seconds().dropna().to_numpy()
        if len(lap_times) >= min_laps:
            val = float(np.median(lap_times))
            if not math.isnan(val):
                clean_pace_map[str(drv)] = val
        elif len(lap_times) > 0:
            val = float(lap_times.min())
            if not math.isnan(val):
                clean_pace_map[str(drv)] = val

    # Fallback to driver's overall median lap time if clean air was not isolated
    overall_median = None
    if clean_pace_map:
        valid_paces = [p for p in clean_pace_map.values() if not math.isnan(p)]
        if valid_paces:
            overall_median = float(np.median(valid_paces))

    for drv in df["Driver"].unique():
        drv_str = str(drv)
        if drv_str not in clean_pace_map:
            drv_all = df[(df["Driver"] == drv) & df["LapTime"].notna()]
            if not drv_all.empty:
                med_val = drv_all["LapTime"].dt.total_seconds().median()
                if pd.notna(med_val):
                    clean_pace_map[drv_str] = float(med_val)
                elif overall_median is not None:
                    clean_pace_map[drv_str] = overall_median
                else:
                    clean_pace_map[drv_str] = 90.0
            elif overall_median is not None:
                clean_pace_map[drv_str] = overall_median
            else:
                clean_pace_map[drv_str] = 90.0  # nominal default

    return clean_pace_map


def compute_fuel_corrected_degradation_slope(
    driver_laps: pd.DataFrame,
    current_lap: int,
    stint_start_lap: int,
    window_size: int = 5,
    fuel_burn_sec: float = FUEL_BURN_SEC_PER_LAP,
) -> float:
    """
    Calculates fuel-corrected tyre degradation slope (seconds/lap) over recent stint laps.
    Corrects each lap time for fuel burn-off: t_corrected = t_raw + fuel_burn_sec * (lap - stint_start).
    A positive slope indicates degradation (losing pace despite burning fuel).
    """
    if driver_laps.empty:
        return 0.0

    mask = (
        (driver_laps["LapNumber"] <= current_lap)
        & (driver_laps["LapNumber"] >= stint_start_lap)
        & driver_laps["LapTime"].notna()
    )
    if "PitInTime" in driver_laps.columns:
        mask &= driver_laps["PitInTime"].isna()
    if "PitOutTime" in driver_laps.columns:
        mask &= driver_laps["PitOutTime"].isna()
    if "TrackStatus" in driver_laps.columns:
        mask &= (driver_laps["TrackStatus"].astype(str) == "1")

    subset = driver_laps[mask].tail(window_size)
    if len(subset) < 2:
        return 0.0

    x = subset["LapNumber"].to_numpy().astype(float)
    raw_times = subset["LapTime"].dt.total_seconds().to_numpy()
    y = raw_times + fuel_burn_sec * (x - float(stint_start_lap))

    # Linear regression slope: sum((x - mean_x) * (y - mean_y)) / sum((x - mean_x)^2)
    x_mean = np.mean(x)
    y_mean = np.mean(y)
    numerator = np.sum((x - x_mean) * (y - y_mean))
    denominator = np.sum((x - x_mean) ** 2)

    if denominator <= 1e-6:
        return 0.0

    slope = float(numerator / denominator)
    return round(slope, 4)


def compute_pit_loss_delta(track_status_code: int) -> float:
    """
    Computes pit-loss time delta (seconds saved relative to green flag pit loss).
    Under Green: 0.0s saved (loss ~22s).
    Under VSC: 8.5s saved (loss ~13.5s).
    Under SC: 12.0s saved (loss ~10.0s).
    Under Red: 22.0s saved (neutralized / free change).
    """
    if track_status_code == 4:  # Safety Car
        return PIT_LOSS_GREEN_SEC - PIT_LOSS_SC_SEC  # ~12.0s
    if track_status_code in (6, 7):  # Virtual Safety Car
        return PIT_LOSS_GREEN_SEC - PIT_LOSS_VSC_SEC  # ~8.5s
    if track_status_code == 2:  # Yellow flag
        return 2.0
    if track_status_code == 5:  # Red flag
        return PIT_LOSS_GREEN_SEC
    return 0.0


def compute_traffic_rejoin_gap(
    driver_code: str,
    current_lap: int,
    laps_df: pd.DataFrame,
    pit_loss_sec: float = PIT_LOSS_GREEN_SEC,
) -> float:
    """
    Projects driver's rejoin timestamp if boxing on this lap, and finds the time gap
    to surrounding traffic (seconds) upon rejoining.
    Specifically checks the gap to the car directly ahead on track (T_rejoin - T_ahead)
    and the gap to the car directly behind (T_behind - T_rejoin).
    A small gap (< 1.5s) indicates rejoining in traffic.
    """
    if laps_df is None or laps_df.empty:
        return 10.0

    df = (
        standardize_laps_dataframe(laps_df)
        if ("Time" not in laps_df.columns or "LapNumber" not in laps_df.columns or "Driver" not in laps_df.columns)
        else laps_df
    )
    if df.empty or "Driver" not in df.columns or "Time" not in df.columns or "LapNumber" not in df.columns:
        return 10.0

    driver_lap_rows = df[(df["Driver"] == str(driver_code)) & (df["LapNumber"] == current_lap)]
    if driver_lap_rows.empty or pd.isna(driver_lap_rows.iloc[0]["Time"]):
        return 10.0

    t_val = driver_lap_rows.iloc[0]["Time"]
    t_current = t_val.total_seconds() if hasattr(t_val, "total_seconds") else float(t_val)
    t_projected = t_current + pit_loss_sec

    # Find surrounding cars on the same or adjacent lap
    nearby_laps = df[
        (df["Driver"] != str(driver_code))
        & (df["LapNumber"] == current_lap)
        & df["Time"].notna()
    ]
    if nearby_laps.empty:
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

    # Cars ahead completed lap before projected rejoin (time <= t_projected)
    cars_ahead = other_times[other_times <= t_projected]
    gap_ahead = float(t_projected - np.max(cars_ahead)) if len(cars_ahead) > 0 else 25.0

    # Cars behind will complete lap after projected rejoin (time > t_projected)
    cars_behind = other_times[other_times > t_projected]
    gap_behind = float(np.min(cars_behind) - t_projected) if len(cars_behind) > 0 else 25.0

    # Traffic gap is the nearest surrounding vehicle buffer
    gap = min(gap_ahead, gap_behind)
    return round(float(np.clip(gap, 0.0, 30.0)), 2)


# ---------------------------------------------------------------------------
# 2. Synchronized Columnar Array Extraction from FastF1 Session
# ---------------------------------------------------------------------------

def session_to_synchronized_arrays(
    session: fastf1.core.Session,
    fps: int = DEFAULT_FPS,
) -> Optional[Dict[str, Any]]:
    """
    Interpolates driver telemetry onto a unified uniform timeline at `fps` Hz in memory.
    Returns dictionary with:
    - `timeline`: 1D array of race timestamps (seconds from race start)
    - `driver_codes`: list of driver abbreviations
    - `channels`: dict of 2D numpy arrays [num_drivers, num_frames]:
      'dist', 'speed', 'throttle', 'brake', 'drs', 'position', 'in_pit', 'status', 'lap', 'tyre', 'tyre_life'
    - `circuit_length`: track circuit length in meters
    """
    if not hasattr(session, "car_data") or not session.car_data or not hasattr(session, "laps") or session.laps.empty:
        return None

    laps = session.laps
    l1 = laps[laps["LapNumber"] == 1]
    if l1.empty or l1["Time"].isna().all() or l1["LapTime"].isna().all():
        return None

    # Calculate global race start (t0) and finish
    valid_l1 = l1[l1["Time"].notna() & l1["LapTime"].notna()]
    if valid_l1.empty:
        return None

    t_start = float((valid_l1["Time"] - valid_l1["LapTime"]).min().total_seconds())
    valid_final = laps[laps["Time"].notna()]
    if valid_final.empty:
        return None
    t_end = float(valid_final["Time"].max().total_seconds())

    if t_end <= t_start:
        return None

    dt = 1.0 / fps
    timeline = np.arange(t_start, t_end, dt)
    num_frames = len(timeline)
    if num_frames < int(fps * 30):  # minimum 30 seconds
        return None

    drivers = [
        d for d in session.drivers
        if d in session.car_data and len(session.car_data[d]) > 0
    ]
    if len(drivers) < 2:
        return None

    driver_codes: List[str] = []
    for d in drivers:
        try:
            info = session.get_driver(d)
            driver_codes.append(str(info.get("Abbreviation", d)))
        except Exception:
            driver_codes.append(str(d))

    num_drvs = len(drivers)

    # Initialize columnar arrays
    dist_arr = np.zeros((num_drvs, num_frames), dtype=np.float32)
    speed_arr = np.zeros((num_drvs, num_frames), dtype=np.float32)
    throttle_arr = np.zeros((num_drvs, num_frames), dtype=np.float32)
    brake_arr = np.zeros((num_drvs, num_frames), dtype=np.float32)
    drs_arr = np.zeros((num_drvs, num_frames), dtype=np.uint8)
    in_pit_arr = np.zeros((num_drvs, num_frames), dtype=np.uint8)
    status_arr = np.zeros((num_drvs, num_frames), dtype=np.uint8)
    lap_arr = np.zeros((num_drvs, num_frames), dtype=np.int16)
    tyre_arr = np.full((num_drvs, num_frames), 1, dtype=np.uint8)
    tyre_life_arr = np.zeros((num_drvs, num_frames), dtype=np.float32)

    # Pos data coordinates (if available)
    has_pos = hasattr(session, "pos_data") and session.pos_data
    x_arr = np.zeros((num_drvs, num_frames), dtype=np.float32)
    y_arr = np.zeros((num_drvs, num_frames), dtype=np.float32)

    for idx, d in enumerate(drivers):
        cd = session.car_data[d]
        t_cd = cd["Time"].dt.total_seconds().to_numpy()
        order_cd = np.argsort(t_cd)
        t_sorted = t_cd[order_cd]

        spd_raw = cd["Speed"].to_numpy()[order_cd] if "Speed" in cd.columns else np.zeros(len(t_sorted))
        thr_raw = cd["Throttle"].to_numpy()[order_cd] if "Throttle" in cd.columns else np.zeros(len(t_sorted))
        brk_raw = cd["Brake"].to_numpy()[order_cd] if "Brake" in cd.columns else np.zeros(len(t_sorted))
        drs_raw = cd["DRS"].to_numpy()[order_cd] if "DRS" in cd.columns else np.zeros(len(t_sorted))

        speed_interp = np.interp(timeline, t_sorted, spd_raw).astype(np.float32)
        throttle_interp = np.interp(timeline, t_sorted, thr_raw).astype(np.float32)
        brake_interp = np.interp(timeline, t_sorted, brk_raw.astype(float)).astype(np.float32)
        drs_interp = np.interp(timeline, t_sorted, drs_raw.astype(float)).astype(np.uint8)

        speed_arr[idx] = speed_interp
        throttle_arr[idx] = throttle_interp
        brake_arr[idx] = brake_interp
        drs_arr[idx] = drs_interp

        # Cumulative distance integrated from speed (m)
        dist_arr[idx] = np.cumsum(speed_interp / 3.6 * dt, dtype=np.float32)

        # 2D coordinates if available
        if has_pos and d in session.pos_data and len(session.pos_data[d]) > 0:
            pd_ = session.pos_data[d]
            t_pd = pd_["Time"].dt.total_seconds().to_numpy()
            order_pd = np.argsort(t_pd)
            x_arr[idx] = np.interp(timeline, t_pd[order_pd], pd_["X"].to_numpy()[order_pd]).astype(np.float32)
            y_arr[idx] = np.interp(timeline, t_pd[order_pd], pd_["Y"].to_numpy()[order_pd]).astype(np.float32)

        # Stint, lap, pit, and retirement mapping from laps dataframe
        drv_laps = laps.pick_drivers(d)
        if not drv_laps.empty:
            valid_t = drv_laps["Time"].dropna()
            if not valid_t.empty:
                last_t = valid_t.max().total_seconds()
                status_arr[idx, timeline > last_t] = 1  # Retired / finished

            for _, r in drv_laps.iterrows():
                # Pit in / out windows
                if pd.notna(r.get("PitInTime")):
                    pin = r["PitInTime"].total_seconds()
                    pout = (
                        r["PitOutTime"].total_seconds()
                        if pd.notna(r.get("PitOutTime"))
                        else pin + 30.0
                    )
                    in_pit_arr[idx, (timeline >= pin) & (timeline <= pout)] = 1

                # Lap number and tyre attributes
                if pd.notna(r.get("Time")) and pd.notna(r.get("LapNumber")):
                    lap_num = int(r["LapNumber"])
                    l_end = r["Time"].total_seconds()
                    l_start = (
                        (r["Time"] - r["LapTime"]).total_seconds()
                        if pd.notna(r.get("LapTime"))
                        else l_end - 90.0
                    )
                    mask_lap = (timeline >= l_start) & (timeline <= l_end)
                    lap_arr[idx, mask_lap] = lap_num
                    comp_str = str(r.get("Compound", "MEDIUM"))
                    tyre_arr[idx, mask_lap] = get_tyre_compound_int(comp_str)
                    tyre_life_arr[idx, mask_lap] = float(r.get("TyreLife", 1.0))

    # Freeze distance and zero out speed for retired drivers
    for idx in range(num_drvs):
        retired_mask = status_arr[idx] == 1
        if np.any(retired_mask):
            first_ret = int(np.argmax(retired_mask))
            speed_arr[idx, first_ret:] = 0.0
            throttle_arr[idx, first_ret:] = 0.0
            brake_arr[idx, first_ret:] = 0.0
            drs_arr[idx, first_ret:] = 0
            if first_ret > 0:
                dist_arr[idx, first_ret:] = dist_arr[idx, first_ret - 1]
            else:
                dist_arr[idx, :] = 0.0

    # Strictly monotonic cumulative distance
    dist_arr = np.maximum.accumulate(dist_arr, axis=1).astype(np.float32)

    # Compute continuous race position ranks: P1, P2, ..., P_N
    # Active runners (status == 0) ranked ahead of retired (status != 0), sorted by dist descending
    drv_idx_grid = np.broadcast_to(
        np.arange(num_drvs)[:, None], (num_drvs, num_frames)
    )
    order = np.lexsort((drv_idx_grid, -dist_arr, status_arr != 0), axis=0)
    ranks = np.arange(1, num_drvs + 1, dtype=np.uint8)[:, None]
    pos_arr = np.empty((num_drvs, num_frames), dtype=np.uint8)
    np.put_along_axis(pos_arr, order, ranks, axis=0)

    # Estimate circuit length from fastest lap or median distance per lap
    circuit_length = 5412.0
    try:
        fastest = laps.pick_fastest()
        if fastest is not None:
            tel = fastest.get_telemetry()
            if tel is not None and not tel.empty and "Distance" in tel.columns:
                circuit_length = float(tel["Distance"].max())
    except Exception:
        pass

    channels = {
        "dist": dist_arr,
        "speed": speed_arr,
        "throttle": throttle_arr,
        "brake": brake_arr,
        "drs": drs_arr,
        "position": pos_arr,
        "in_pit": in_pit_arr,
        "status": status_arr,
        "lap": lap_arr,
        "tyre": tyre_arr,
        "tyre_life": tyre_life_arr,
        "x": x_arr,
        "y": y_arr,
    }

    return {
        "timeline": timeline - t_start,  # Relative timeline starting at 0
        "driver_codes": driver_codes,
        "channels": channels,
        "circuit_length": circuit_length,
        "fps": fps,
    }


# ---------------------------------------------------------------------------
# 3. Overtake Dataset Mining Engine
# ---------------------------------------------------------------------------

def mine_overtake_dataset_from_channels(
    session_id: str,
    circuit_id: int,
    channels: Dict[str, np.ndarray],
    timeline: np.ndarray,
    driver_codes: List[str],
    circuit_length: float,
    clean_pace_map: Dict[str, float],
    fps: int = DEFAULT_FPS,
    sample_stride_sec: float = 1.0,
    max_samples: Optional[int] = None,
    start_ignore_sec: float = 8.0,
    centerline: Optional[Any] = None,
) -> pd.DataFrame:
    """
    Mines car-following candidate pairs and extracts continuous physics features
    with ground-truth binary labels (1 = overtake within 10s stable >= 3s, 0 = defended > 5s).
    """
    pos = channels["position"]
    dist = channels["dist"]
    speed = channels["speed"]
    throttle = channels["throttle"]
    brake = channels["brake"]
    drs = channels["drs"]
    in_pit = channels["in_pit"]
    status = channels["status"]
    lap = channels["lap"]
    tyre = channels["tyre"]
    tyre_life = channels["tyre_life"]
    x = channels.get("x")
    y = channels.get("y")

    num_drvs, num_frames = pos.shape
    dt = 1.0 / fps

    lookahead_frames = int(10.0 * fps)
    stable_frames = int(3.0 * fps)
    sustained_frames = int(5.0 * fps)
    stride_frames = max(1, int(sample_stride_sec * fps))
    max_horizon_frames = lookahead_frames + stable_frames
    start_ignore_frames = int(start_ignore_sec * fps)
    if start_ignore_frames >= max(0, num_frames - max_horizon_frames):
        start_ignore_frames = 0

    # Detect heavy braking zones for the circuit
    braking_zones = find_heavy_braking_zones(
        dist[0], speed[0], brake[0], circuit_length=circuit_length
    )

    curvature_arr = None
    if centerline is not None and len(centerline) >= 3:
        curvature_arr = compute_track_curvature(centerline)

    records: List[Dict[str, Any]] = []

    # Iterate through race timeline ensuring full stability evaluation window
    for f in range(start_ignore_frames, num_frames - max_horizon_frames, stride_frames):
        # Order of driver indices by current position: [P1_idx, P2_idx, ...]
        pos_slice = pos[:, f]
        pos_order = np.argsort(pos_slice)

        t_sec = float(timeline[f])

        for rank in range(1, num_drvs):
            att_idx = pos_order[rank]       # Attacker (position P+1)
            dfnd_idx = pos_order[rank - 1]  # Defender (position P)

            # Check track distance and temporal gap: attacker following defender
            delta_s = float(dist[dfnd_idx, f] - dist[att_idx, f])
            v_ref_mps = max(float(speed[att_idx, f]), float(speed[dfnd_idx, f])) / 3.6
            delta_t = delta_s / max(v_ref_mps, 1.0)

            # Close following criteria: 0 < delta_s <= 35m OR delta_t <= 1.2s (with delta_s <= 120m)
            if delta_s <= 0.0 or not (delta_s <= 35.0 or (delta_s <= 120.0 and delta_t <= 1.2)):
                continue

            # Exclude pit lane and retired cars
            if (
                in_pit[att_idx, f] == 1
                or in_pit[dfnd_idx, f] == 1
                or status[att_idx, f] != 0
                or status[dfnd_idx, f] != 0
            ):
                continue

            # Ground truth labeling logic
            # diff = pos_attacker - pos_defender: diff > 0 means defender is ahead, diff < 0 means attacker is ahead
            diff_horizon = pos[att_idx, f : f + max_horizon_frames].astype(int) - pos[dfnd_idx, f : f + max_horizon_frames].astype(int)
            flip_indices = np.where(diff_horizon[:lookahead_frames] < 0)[0]
            label: Optional[int] = None

            if len(flip_indices) > 0:
                k_flip = flip_indices[0]
                # Check stability: attacker remains ahead for >= 3 seconds forward from the flip
                if np.all(diff_horizon[k_flip : k_flip + stable_frames] < 0):
                    # Verify neither driver entered pit or retired during maneuver
                    eval_window = slice(f, f + k_flip + stable_frames)
                    if not np.any(in_pit[att_idx, eval_window] == 1) and not np.any(in_pit[dfnd_idx, eval_window] == 1):
                        if not np.any(status[att_idx, eval_window] != 0) and not np.any(status[dfnd_idx, eval_window] != 0):
                            label = 1  # Successful Overtake

            if label is None:
                # Negative condition: Defender maintains position for >= 5s WITHOUT being passed in the lookahead window
                if len(flip_indices) == 0 and np.all(diff_horizon[:sustained_frames] > 0):
                    eval_window = slice(f, f + sustained_frames)
                    if not np.any(in_pit[att_idx, eval_window] == 1) and not np.any(in_pit[dfnd_idx, eval_window] == 1):
                        if not np.any(status[att_idx, eval_window] != 0) and not np.any(status[dfnd_idx, eval_window] != 0):
                            label = 0  # Sustained Defense

            if label is None:
                # Ambiguous / aborted following window
                continue

            # Compute features at frame f
            att_code = driver_codes[att_idx]
            dfnd_code = driver_codes[dfnd_idx]

            v_att = float(speed[att_idx, f])
            v_dfnd = float(speed[dfnd_idx, f])
            delta_v = v_att - v_dfnd

            # Acceleration delta in m/s^2 (lookback 1s)
            f_prev = max(0, f - fps)
            dt_acc = max(0.2, (f - f_prev) * dt)
            a_att = ((v_att - float(speed[att_idx, f_prev])) / 3.6) / dt_acc
            a_dfnd = ((v_dfnd - float(speed[dfnd_idx, f_prev])) / 3.6) / dt_acc
            delta_a = a_att - a_dfnd

            # Closing kinetic energy per unit mass: 0.5 * (v_att^2 - v_dfnd^2) in m^2/s^2
            closing_ke = 0.5 * ((v_att / 3.6) ** 2 - (v_dfnd / 3.6) ** 2)

            # DRS binary state for attacker
            raw_drs = int(drs[att_idx, f])
            drs_active = 1 if (raw_drs >= 10 or raw_drs in (1, 2, 12, 14)) else 0

            # Clean-air pace advantage & differential (Delta Pace_clean)
            curr_lap_num = int(lap[att_idx, f])
            p_dfnd = clean_pace_map.get((dfnd_code, curr_lap_num), clean_pace_map.get(dfnd_code, 90.0))
            p_att = clean_pace_map.get((att_code, curr_lap_num), clean_pace_map.get(att_code, 90.0))
            pace_adv = round(float(p_dfnd - p_att), 4) if not math.isnan(p_dfnd - p_att) else 0.0
            clean_air_pace_diff = round(float(p_att - p_dfnd), 4) if not math.isnan(p_att - p_dfnd) else 0.0

            # Compound advantage & tyre wear delta
            c_att = int(tyre[att_idx, f])
            c_dfnd = int(tyre[dfnd_idx, f])
            compound_delta = COMPOUND_GRIP_SCORE.get(c_att, 0.0) - COMPOUND_GRIP_SCORE.get(c_dfnd, 0.0)

            life_att = float(tyre_life[att_idx, f])
            life_dfnd = float(tyre_life[dfnd_idx, f])
            tyre_age_delta = life_att - life_dfnd  # negative = fresher attacker

            # Proximity to heavy braking zones
            dist_to_bz, prox_bz = compute_braking_proximity(
                dist[att_idx, f], braking_zones, circuit_length=circuit_length
            )
            dist_to_next_heavy_braking = compute_distance_to_next_heavy_braking(
                dist[att_idx, f], braking_zones, circuit_length=circuit_length
            )

            # Curvature & straight fraction
            if curvature_arr is not None and len(curvature_arr) >= 3:
                k_idx = int(((dist[att_idx, f] % circuit_length) / circuit_length) * len(curvature_arr)) % len(curvature_arr)
                curvature = float(curvature_arr[k_idx])
            else:
                curvature = 0.0

            straight_frac = compute_straight_fraction_remaining(
                dist_m=dist[att_idx, f],
                circuit_length=circuit_length,
                centerline=centerline,
                curvature_array=curvature_arr,
                braking_zones=braking_zones,
            )

            # Euclidean 2D distance
            if x is not None and y is not None:
                dx = float(x[dfnd_idx, f] - x[att_idx, f])
                dy = float(y[dfnd_idx, f] - y[att_idx, f])
                euclidean_dist = round(math.sqrt(dx * dx + dy * dy), 2)
            else:
                euclidean_dist = round(delta_s, 2)

            # Throttle & Brake statistics over trailing 3 seconds with uniform scale
            w_back = slice(max(0, f - int(3.0 * fps)), f + 1)
            raw_th_w = throttle[att_idx, w_back]
            max_th_val = np.max(raw_th_w) if len(raw_th_w) > 0 else 100.0
            scale_th = 100.0 if (0.0 < max_th_val <= 1.0) else 1.0
            th_recent = raw_th_w * scale_th
            mean_throttle = float(np.mean(th_recent)) if len(th_recent) > 0 else 0.0

            # Real longitudinal throttle jerk dThrottle/dt between adjacent frames
            f_prev = max(0, f - 1)
            th_curr = throttle[att_idx, f] * scale_th
            th_prev = throttle[att_idx, f_prev] * scale_th
            throttle_jerk = float((th_curr - th_prev) / dt) if f > 0 else 0.0

            raw_brk_w = brake[att_idx, w_back]
            brk_recent = (raw_brk_w > 0.0).astype(float)
            mean_brake = float(np.mean(brk_recent)) if len(brk_recent) > 0 else 0.0

            # Real braking onset delta between adjacent frames
            brk_curr = 1.0 if brake[att_idx, f] > 0.0 else 0.0
            brk_prev = 1.0 if brake[att_idx, f_prev] > 0.0 else 0.0
            brake_onset_delta = float((brk_curr - brk_prev) / dt) if f > 0 else 0.0

            record = {
                "session_id": session_id,
                "circuit_id": int(circuit_id),
                "t": round(t_sec, 2),
                "lap": int(lap[att_idx, f]),
                "attacker": att_code,
                "defender": dfnd_code,
                "delta_s": round(delta_s, 2),
                "delta_t": round(delta_t, 3),
                "delta_v": round(delta_v, 2),
                "delta_a": round(delta_a, 3),
                "closing_kinetic_energy": round(closing_ke, 2),
                "drs_active": drs_active,
                "clean_air_pace_advantage": pace_adv,
                "clean_air_pace_diff": clean_air_pace_diff,
                "compound_delta": round(compound_delta, 1),
                "tyre_age_delta": round(tyre_age_delta, 1),
                "proximity_to_braking_zone": prox_bz,
                "dist_to_braking_zone": dist_to_bz,
                "dist_to_next_heavy_braking": dist_to_next_heavy_braking,
                "straight_fraction_remaining": straight_frac,
                "curvature": curvature,
                "euclidean_dist": euclidean_dist,
                "mean_throttle": round(mean_throttle, 2),
                "throttle_jerk": round(throttle_jerk, 2),
                "mean_brake": round(mean_brake, 2),
                "brake_onset_delta": round(brake_onset_delta, 2),
                "target_overtake": int(label),
            }
            records.append(record)

            if max_samples and len(records) >= max_samples:
                break
        if max_samples and len(records) >= max_samples:
            break

    df = pd.DataFrame(records)
    return df


# ---------------------------------------------------------------------------
# 4. Pit Stop Dataset Mining Engine
# ---------------------------------------------------------------------------

def mine_pit_dataset_from_laps(
    session_id: str,
    circuit_id: int,
    laps_df: pd.DataFrame,
    total_laps: Optional[int] = None,
) -> pd.DataFrame:
    """
    Mines lap-by-lap pit stop hazard records with discrete-time hazard labels (Y_L+1, Y_L+2, Y_L+3)
    and strategy features (tyre life, compound, stint progression, fuel-corrected deg slope, pit-loss delta, traffic rejoin).
    """
    if laps_df is None or laps_df.empty:
        return pd.DataFrame()

    df = standardize_laps_dataframe(laps_df)
    if df.empty or "Driver" not in df.columns or "LapNumber" not in df.columns:
        return pd.DataFrame()

    if total_laps is None or total_laps <= 0:
        total_laps = int(df["LapNumber"].max()) if not df.empty else 57
    records: List[Dict[str, Any]] = []

    for drv, df_drv in df.groupby("Driver"):
        df_drv = df_drv.sort_values("LapNumber")
        pit_in_laps = set(
            df_drv[df_drv["PitInTime"].notna()]["LapNumber"].dropna().astype(int)
        )
        max_drv_lap = int(df_drv["LapNumber"].max())

        stint_start_lap = 1
        current_stint = 1

        for _, row in df_drv.iterrows():
            lap_num = int(row["LapNumber"])
            if lap_num >= max_drv_lap:
                continue  # Final lap cannot trigger future pit hazard

            # Update stint start tracking
            row_stint = row.get("Stint")
            if pd.notna(row_stint):
                if int(row_stint) != current_stint:
                    current_stint = int(row_stint)
                    stint_start_lap = lap_num
            elif lap_num > 1 and (lap_num - 1) in pit_in_laps:
                current_stint += 1
                stint_start_lap = lap_num

            # Discrete-time hazard labels:
            # Does the car box on L+1?
            # Does the car box within 2 laps (L+1 or L+2)?
            # Does the car box within 3 laps (L+1, L+2, or L+3)?
            future_pits = [p for p in pit_in_laps if p > lap_num]
            next_pit_lap = min(future_pits) if future_pits else 9999
            l_diff = next_pit_lap - lap_num

            y_l1 = 1 if l_diff == 1 else 0
            y_l2 = 1 if l_diff in (1, 2) else 0
            y_l3 = 1 if l_diff in (1, 2, 3) else 0

            # Primary single-stage hazard target: pitting within 1 lap
            target_pit = y_l1

            # Tyre compound
            comp_str = str(row.get("Compound", "MEDIUM"))
            comp_int = get_tyre_compound_int(comp_str)
            if comp_int < 0:
                comp_int = 1  # default to Medium

            # Tyre life & stint progression ratio
            tyre_life = float(row.get("TyreLife", 1.0)) if pd.notna(row.get("TyreLife")) else 1.0
            expected_life = EXPECTED_COMPOUND_LIFE.get(comp_int, 28.0)
            progression_ratio = round(float(np.clip(tyre_life / max(expected_life, 1.0), 0.0, 2.5)), 3)

            # Fuel-corrected degradation slope
            deg_slope = compute_fuel_corrected_degradation_slope(
                driver_laps=df_drv,
                current_lap=lap_num,
                stint_start_lap=stint_start_lap,
            )

            # Track status & neutralization flags
            raw_status = str(row.get("TrackStatus", "1"))
            sc_active = 1 if "4" in raw_status else 0
            vsc_active = 1 if ("6" in raw_status or "7" in raw_status) else 0
            track_status_int = 4 if sc_active else (6 if vsc_active else 1)

            # Pit-loss delta
            loss_delta = compute_pit_loss_delta(track_status_int)

            # Traffic rejoin gap
            rejoin_gap = compute_traffic_rejoin_gap(
                driver_code=str(drv),
                current_lap=lap_num,
                laps_df=df,
                pit_loss_sec=PIT_LOSS_GREEN_SEC - loss_delta,
            )

            pos_val = int(row.get("Position", 10)) if pd.notna(row.get("Position")) else 10

            records.append({
                "session_id": session_id,
                "circuit_id": int(circuit_id),
                "driver": str(drv),
                "lap_number": lap_num,
                "total_laps": total_laps,
                "position": pos_val,
                "stint": current_stint,
                "tyre_life": int(tyre_life),
                "tyre_compound": float(comp_int),
                "stint_progression_ratio": progression_ratio,
                "fuel_corrected_degradation_slope": deg_slope,
                "pit_loss_delta": round(loss_delta, 1),
                "track_status": track_status_int,
                "sc_active": sc_active,
                "vsc_active": vsc_active,
                "traffic_rejoin_gap": round(rejoin_gap, 2),
                "target_pit_l1": y_l1,
                "target_pit_l2": y_l2,
                "target_pit_l3": y_l3,
                "target_pit": target_pit,
            })

    return pd.DataFrame(records)


# ---------------------------------------------------------------------------
# 5. High-Level Dataset Mining Orchestrator & Exporter
# ---------------------------------------------------------------------------

class FastF1DatasetMiner:
    """
    End-to-end mining orchestrator that extracts overtake and pit stop datasets
    from FastF1 historical sessions and/or precomputed local FrameStores.
    """

    def __init__(self, cache_dir: Optional[Union[str, Path]] = None):
        self.cache_dir = ensure_fastf1_cache(cache_dir)

    def mine_session(
        self,
        year: int,
        round_number: int,
        session_type: str = "R",
        max_samples_per_race: Optional[int] = None,
        sample_stride_sec: float = 1.0,
    ) -> Tuple[pd.DataFrame, pd.DataFrame]:
        """
        Loads session from FastF1 cache/download and extracts both datasets.
        Returns (overtake_df, pit_df).
        """
        session_id = f"{year}_{round_number}_{session_type}"
        print(f"Mining session {session_id} from FastF1...")

        session = fastf1.get_session(year, round_number, session_type)
        session.load(telemetry=True, weather=False, messages=False)

        if not hasattr(session, "laps") or session.laps.empty:
            print(f"Warning: No lap data found for {session_id}")
            return pd.DataFrame(), pd.DataFrame()

        clean_pace_map = compute_driver_clean_air_pace(session.laps)
        laps_std = standardize_laps_dataframe(session.laps)
        max_lap = int(laps_std["LapNumber"].max()) if not laps_std.empty else 60
        for drv, df_drv in laps_std.groupby("Driver"):
            for l_num in range(1, max_lap + 1):
                clean_pace_map[(str(drv), l_num)] = compute_rolling_clean_air_pace(df_drv, l_num)

        # 1. Mine Pit Stop Dataset directly from laps
        pit_df = mine_pit_dataset_from_laps(
            session_id=session_id,
            circuit_id=round_number,
            laps_df=session.laps,
        )

        # 2. Extract synchronized columnar arrays & mine Overtake Dataset
        arrays_data = session_to_synchronized_arrays(session, fps=DEFAULT_FPS)
        if arrays_data is None:
            print(f"Warning: Telemetry synchronization failed for {session_id}")
            overtake_df = pd.DataFrame()
        else:
            overtake_df = mine_overtake_dataset_from_channels(
                session_id=session_id,
                circuit_id=round_number,
                channels=arrays_data["channels"],
                timeline=arrays_data["timeline"],
                driver_codes=arrays_data["driver_codes"],
                circuit_length=arrays_data["circuit_length"],
                clean_pace_map=clean_pace_map,
                fps=arrays_data["fps"],
                sample_stride_sec=sample_stride_sec,
                max_samples=max_samples_per_race,
            )

        return overtake_df, pit_df

    def mine_from_frame_store(
        self,
        session_id: str,
        circuit_id: int,
        frame_store: Any,
        laps_df: pd.DataFrame,
        circuit_length: float = 5412.0,
        sample_stride_sec: float = 1.0,
        max_samples_per_race: Optional[int] = None,
    ) -> Tuple[pd.DataFrame, pd.DataFrame]:
        """Mines datasets from an existing precomputed FrameStore and laps dataframe."""
        laps_std = standardize_laps_dataframe(laps_df)
        clean_pace_map = compute_driver_clean_air_pace(laps_std)
        max_lap = int(laps_std["LapNumber"].max()) if not laps_std.empty else 60
        for drv, df_drv in laps_std.groupby("Driver"):
            for l_num in range(1, max_lap + 1):
                clean_pace_map[(str(drv), l_num)] = compute_rolling_clean_air_pace(df_drv, l_num)
        fps = getattr(frame_store, "FPS", 25)

        # Pit stop dataset from standardized laps
        pit_df = mine_pit_dataset_from_laps(
            session_id=session_id,
            circuit_id=circuit_id,
            laps_df=laps_std,
        )

        # Overtake dataset from FrameStore channels
        channels = {
            "position": frame_store.channels["position"],
            "dist": frame_store.channels["dist"],
            "speed": frame_store.channels["speed"],
            "throttle": frame_store.channels["throttle"],
            "brake": frame_store.channels["brake"],
            "drs": frame_store.channels["drs"],
            "in_pit": frame_store.channels.get("inPit", np.zeros_like(frame_store.channels["speed"], dtype=np.uint8)),
            "status": frame_store.channels.get("status", np.zeros_like(frame_store.channels["speed"], dtype=np.uint8)),
            "lap": frame_store.channels.get("lap", np.ones_like(frame_store.channels["speed"], dtype=np.int16)),
            "tyre": frame_store.channels.get("tyre", np.ones_like(frame_store.channels["speed"], dtype=np.uint8)),
            "tyre_life": frame_store.channels.get("tyreLife", np.zeros_like(frame_store.channels["speed"], dtype=np.float32)),
            "x": frame_store.channels.get("x"),
            "y": frame_store.channels.get("y"),
        }
        num_frames = frame_store.total_frames
        timeline = np.arange(num_frames) / float(fps)

        centerline = None
        if hasattr(frame_store, "track_centerline") and frame_store.track_centerline:
            centerline = frame_store.track_centerline
        elif hasattr(frame_store, "centerline") and frame_store.centerline:
            centerline = frame_store.centerline

        overtake_df = mine_overtake_dataset_from_channels(
            session_id=session_id,
            circuit_id=circuit_id,
            channels=channels,
            timeline=timeline,
            driver_codes=frame_store.driver_codes,
            circuit_length=circuit_length,
            clean_pace_map=clean_pace_map,
            fps=fps,
            sample_stride_sec=sample_stride_sec,
            max_samples=max_samples_per_race,
            centerline=centerline,
        )

        return overtake_df, pit_df


def save_dataset(
    df: pd.DataFrame,
    filepath: Union[str, Path],
    file_format: str = "auto",
) -> Path:
    """
    Saves DataFrame to CSV or Parquet.
    If 'parquet' is requested but no parquet engine is available, falls back to CSV.
    """
    out_path = Path(filepath)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    target_format = file_format.lower()
    if target_format == "auto":
        target_format = "parquet" if out_path.suffix.lower() == ".parquet" else "csv"

    if target_format == "parquet":
        try:
            parquet_path = out_path.with_suffix(".parquet")
            df.to_parquet(parquet_path, index=False)
            return parquet_path
        except (ImportError, ModuleNotFoundError) as e:
            fallback_csv = out_path.with_suffix(".csv")
            print(f"Notice: Parquet engine not installed ({e}). Saving to CSV: {fallback_csv}")
            df.to_csv(fallback_csv, index=False)
            return fallback_csv

    csv_path = out_path.with_suffix(".csv")
    df.to_csv(csv_path, index=False)
    return csv_path


# ---------------------------------------------------------------------------
# 6. Mock Data Generators for Dry-Runs and Fast Pipeline Testing
# ---------------------------------------------------------------------------

def generate_mock_overtake_dataset(n_samples: int = 200, random_seed: int = 42) -> pd.DataFrame:
    """Generates synthetic dataset strictly matching the Overtake Dataset schema for tests."""
    rng = np.random.default_rng(random_seed)
    drivers = ["VER", "HAM", "NOR", "LEC", "ALO", "PIA", "RUS", "SAI"]

    delta_s = rng.uniform(2.0, 35.0, n_samples)
    delta_v = rng.uniform(-5.0, 30.0, n_samples)
    drs = rng.choice([0, 1], size=n_samples, p=[0.6, 0.4])
    prox_bz = rng.uniform(0.0, 1.0, n_samples)

    # Physics probability of pass
    prob = np.clip(
        np.exp(-delta_s / 15.0) * (np.maximum(0.0, delta_v) / 20.0 + drs * 0.4) + prox_bz * 0.2,
        0.05,
        0.95,
    )
    targets = rng.binomial(1, prob)

    pace_adv = np.round(rng.uniform(-0.8, 1.2, n_samples), 4)
    dist_bz = np.round(rng.uniform(10.0, 500.0, n_samples), 2)

    return pd.DataFrame({
        "session_id": "MOCK_2023_1_R",
        "circuit_id": 1,
        "t": np.round(rng.uniform(60.0, 5400.0, n_samples), 2),
        "lap": rng.integers(2, 57, n_samples),
        "attacker": rng.choice(drivers, n_samples),
        "defender": rng.choice(drivers, n_samples),
        "delta_s": np.round(delta_s, 2),
        "delta_t": np.round(delta_s / np.maximum(rng.uniform(40.0, 80.0, n_samples), 1.0), 3),
        "delta_v": np.round(delta_v, 2),
        "delta_a": np.round(rng.uniform(-3.0, 4.0, n_samples), 3),
        "closing_kinetic_energy": np.round(rng.uniform(-20.0, 50.0, n_samples), 2),
        "drs_active": drs,
        "clean_air_pace_advantage": pace_adv,
        "clean_air_pace_diff": -pace_adv,
        "compound_delta": rng.choice([-1.0, 0.0, 1.0], n_samples),
        "tyre_age_delta": np.round(rng.uniform(-15.0, 15.0, n_samples), 1),
        "proximity_to_braking_zone": np.round(prox_bz, 4),
        "dist_to_braking_zone": dist_bz,
        "dist_to_next_heavy_braking": dist_bz,
        "straight_fraction_remaining": np.round(rng.uniform(0.0, 1.0, n_samples), 3),
        "curvature": np.round(rng.uniform(0.0005, 0.02, n_samples), 5),
        "euclidean_dist": np.round(delta_s * 1.02, 2),
        "mean_throttle": np.round(rng.uniform(70.0, 100.0, n_samples), 2),
        "throttle_jerk": np.round(rng.uniform(-250.0, 250.0, n_samples), 2),
        "mean_brake": np.round(rng.uniform(0.0, 1.0, n_samples), 2),
        "brake_onset_delta": np.round(rng.uniform(-25.0, 25.0, n_samples), 2),
        "target_overtake": targets,
    })


def generate_mock_pit_dataset(n_samples: int = 200, random_seed: int = 42) -> pd.DataFrame:
    """Generates synthetic dataset strictly matching the Pit Stop Dataset schema for tests."""
    rng = np.random.default_rng(random_seed)
    drivers = ["VER", "HAM", "NOR", "LEC", "ALO", "PIA", "RUS", "SAI"]

    tyre_life = rng.integers(1, 38, n_samples)
    compounds = rng.choice([0.0, 1.0, 2.0], n_samples)
    sc = rng.choice([0, 1], size=n_samples, p=[0.92, 0.08])
    vsc = rng.choice([0, 1], size=n_samples, p=[0.95, 0.05])

    prob_pit = np.clip((tyre_life / 32.0) ** 3 + sc * 0.45 + vsc * 0.35, 0.02, 0.95)
    target_pit_l1 = rng.binomial(1, prob_pit)
    target_pit_l2 = np.clip(target_pit_l1 + rng.binomial(1, 0.15, n_samples), 0, 1)
    target_pit_l3 = np.clip(target_pit_l2 + rng.binomial(1, 0.20, n_samples), 0, 1)

    return pd.DataFrame({
        "session_id": "MOCK_2023_1_R",
        "circuit_id": 1,
        "driver": rng.choice(drivers, n_samples),
        "lap_number": rng.integers(1, 57, n_samples),
        "total_laps": 57,
        "position": rng.integers(1, 21, n_samples),
        "stint": rng.integers(1, 4, n_samples),
        "tyre_life": tyre_life,
        "tyre_compound": compounds,
        "stint_progression_ratio": np.round(tyre_life / 28.0, 3),
        "fuel_corrected_degradation_slope": np.round(rng.normal(0.06, 0.04, n_samples), 4),
        "pit_loss_delta": np.where(sc == 1, 12.0, np.where(vsc == 1, 8.5, 0.0)),
        "track_status": np.where(sc == 1, 4, np.where(vsc == 1, 6, 1)),
        "sc_active": sc,
        "vsc_active": vsc,
        "traffic_rejoin_gap": np.round(rng.uniform(0.5, 18.0, n_samples), 2),
        "target_pit_l1": target_pit_l1,
        "target_pit_l2": target_pit_l2,
        "target_pit_l3": target_pit_l3,
        "target_pit": target_pit_l1,
    })
