"""OpenF1 Data Provider & Fallback Loader.

Fetches race session metadata, drivers, laps, stints, weather, race control messages,
and driver telemetry from the OpenF1 REST API (https://api.openf1.org/v1/) and adapts
it to the F1 Synapse FrameStore / LoadedSession format.
"""

import logging
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from typing import Any, Callable, Dict, List, Optional, Tuple

import numpy as np
import pandas as pd
import requests

from src.lib.tyres import get_tyre_compound_int
from src.web.schemas import (
    DriverInfo,
    LapRow,
    RaceControlMessage,
    SessionMeta,
    Stint,
    TrackGeometry,
    WeatherSample,
)
from src.web.services.frame_store import FPS, FrameStore
from src.web.services.track_service import build_track_geometry

logger = logging.getLogger(__name__)

OPENF1_BASE_URL = "https://api.openf1.org/v1"
SESSION_TIMEOUT = 15
MAX_RETRIES = 3


def _safe_get(url: str, params: Optional[dict] = None, timeout: int = SESSION_TIMEOUT) -> Any:
    """Safe HTTP GET with retries and exponential backoff."""
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            resp = requests.get(url, params=params, timeout=timeout)
            if resp.status_code == 200:
                return resp.json()
            elif resp.status_code == 404:
                return []
            else:
                logger.warning("OpenF1 GET %s returned %s (attempt %d/%d)", url, resp.status_code, attempt, MAX_RETRIES)
        except Exception as e:
            logger.warning("OpenF1 GET %s failed: %s (attempt %d/%d)", url, e, attempt, MAX_RETRIES)
        time.sleep(0.5 * attempt)
    return []


def get_openf1_session_key(year: int, round_num: int, session_type: str = "R") -> Optional[Dict[str, Any]]:
    """Resolve the OpenF1 session_key for a given year, round, and session_type.

    Returns the session dict from OpenF1 or None.
    """
    type_map = {
        "R": "Race",
        "Q": "Qualifying",
        "S": "Sprint",
        "SQ": "Sprint Qualifying",
        "FP1": "Practice 1",
        "FP2": "Practice 2",
        "FP3": "Practice 3",
    }
    target_type = type_map.get(session_type.upper(), "Race")

    data = _safe_get(f"{OPENF1_BASE_URL}/sessions", params={"year": year})
    if not data:
        return None

    # Filter by session_name or session_type
    filtered = [
        s for s in data
        if s.get("session_name") == target_type or s.get("session_type") == target_type
    ]
    if not filtered:
        return None

    # Sort strictly by date_start to correspond with season round numbers
    sorted_sessions = sorted(filtered, key=lambda s: s.get("date_start", ""))
    if 1 <= round_num <= len(sorted_sessions):
        return sorted_sessions[round_num - 1]

    return None


def fetch_openf1_drivers(session_key: int) -> Tuple[List[DriverInfo], Dict[int, str], Dict[str, int]]:
    """Fetch drivers for a session and build mappings."""
    raw = _safe_get(f"{OPENF1_BASE_URL}/drivers", params={"session_key": session_key})
    drivers: List[DriverInfo] = []
    num_to_code: Dict[int, str] = {}
    code_to_num: Dict[str, int] = {}

    seen_codes = set()
    for idx, d in enumerate(raw or []):
        code = str(d.get("name_acronym") or d.get("broadcast_name", "")[:3]).upper()
        if not code or code in seen_codes:
            continue
        seen_codes.add(code)

        num = int(d.get("driver_number", 0))
        num_to_code[num] = code
        code_to_num[code] = num

        team_col = str(d.get("team_colour") or "ffffff").strip()
        if not team_col.startswith("#"):
            team_col = f"#{team_col}"

        drivers.append(
            DriverInfo(
                code=code,
                number=num,
                full_name=str(d.get("full_name") or d.get("broadcast_name") or code),
                team=str(d.get("team_name") or ""),
                color=team_col,
                index=idx,
            )
        )

    return drivers, num_to_code, code_to_num


def fetch_openf1_laps_and_stints(
    session_key: int,
    num_to_code: Dict[int, str],
) -> Tuple[List[LapRow], List[Stint], int]:
    """Fetch laps and stints from OpenF1 and convert to web schemas."""
    raw_laps = _safe_get(f"{OPENF1_BASE_URL}/laps", params={"session_key": session_key}) or []
    raw_stints = _safe_get(f"{OPENF1_BASE_URL}/stints", params={"session_key": session_key}) or []

    # Build stint map: (driver_num, lap_num) -> (compound, tyre_life, stint_num)
    stint_map: Dict[Tuple[int, int], Tuple[str, int, int]] = {}
    stints: List[Stint] = []

    for s in raw_stints:
        d_num = s.get("driver_number")
        code = num_to_code.get(d_num)
        if not code:
            continue

        l_start = int(s.get("lap_start", 1))
        l_end = int(s.get("lap_end") or l_start)
        compound = str(s.get("compound") or "UNKNOWN").upper()
        age_start = int(s.get("tyre_age_at_start", 0))
        stint_no = int(s.get("stint_number", 1))

        stints.append(
            Stint(
                driver=code,
                stint=stint_no,
                compound=compound,
                lap_start=l_start,
                lap_end=l_end,
            )
        )

        for l in range(l_start, l_end + 1):
            life = age_start + (l - l_start)
            stint_map[(d_num, l)] = (compound, life, stint_no)

    # Sort laps and identify fastest lap
    valid_durations = [l.get("lap_duration") for l in raw_laps if l.get("lap_duration") and not l.get("is_pit_out_lap")]
    min_lap_duration = min(valid_durations) if valid_durations else None

    # Track personal bests per driver
    personal_bests: Dict[int, float] = {}
    total_laps = 0

    laps: List[LapRow] = []
    for l in raw_laps:
        d_num = l.get("driver_number")
        code = num_to_code.get(d_num)
        if not code:
            continue

        lap_no = int(l.get("lap_number", 1))
        if lap_no > total_laps:
            total_laps = lap_no

        dur = l.get("lap_duration")
        is_pit_out = bool(l.get("is_pit_out_lap", False))

        is_fastest = (dur is not None and min_lap_duration is not None and abs(dur - min_lap_duration) < 1e-4)
        is_pb = False
        if dur is not None and not is_pit_out:
            prev_pb = personal_bests.get(d_num, 1e9)
            if dur < prev_pb:
                is_pb = True
                personal_bests[d_num] = dur

        stint_info = stint_map.get((d_num, lap_no), ("UNKNOWN", 0, 1))

        laps.append(
            LapRow(
                driver=code,
                lap=lap_no,
                time_sec=dur,
                s1=l.get("duration_sector_1"),
                s2=l.get("duration_sector_2"),
                s3=l.get("duration_sector_3"),
                compound=stint_info[0],
                tyre_life=stint_info[1],
                pit_in=False,
                pit_out=is_pit_out,
                is_pb=is_pb,
                is_fastest=is_fastest,
            )
        )

    # Mark pit_in on lap preceding pit_out
    laps_by_drv: Dict[str, List[LapRow]] = {}
    for row in laps:
        laps_by_drv.setdefault(row.driver, []).append(row)

    for drv_laps in laps_by_drv.values():
        drv_laps.sort(key=lambda r: r.lap)
        for i in range(len(drv_laps) - 1):
            if drv_laps[i + 1].pit_out:
                drv_laps[i].pit_in = True

    return laps, stints, total_laps


def fetch_openf1_weather(session_key: int, t0: pd.Timestamp) -> List[WeatherSample]:
    """Fetch weather samples from OpenF1 and convert to web schemas."""
    raw = _safe_get(f"{OPENF1_BASE_URL}/weather", params={"session_key": session_key}) or []
    weather: List[WeatherSample] = []

    for w in raw:
        d_str = w.get("date")
        if not d_str:
            continue
        try:
            sample_t = (pd.to_datetime(d_str) - t0).total_seconds()
        except Exception:
            continue

        weather.append(
            WeatherSample(
                t=float(sample_t),
                air_temp=float(w.get("air_temperature", 20.0)),
                track_temp=float(w.get("track_temperature", 25.0)),
                humidity=float(w.get("humidity", 50.0)),
                wind_speed=float(w.get("wind_speed", 0.0)),
                wind_dir=float(w.get("wind_direction", 0.0)),
                rainfall=bool(w.get("rainfall", 0) > 0),
            )
        )

    return sorted(weather, key=lambda w: w.t)


def fetch_openf1_race_control(
    session_key: int,
    t0: pd.Timestamp,
    num_to_code: Dict[int, str],
) -> Tuple[List[RaceControlMessage], List[Dict[str, Any]]]:
    """Fetch race control messages and generate track status periods."""
    raw = _safe_get(f"{OPENF1_BASE_URL}/race_control", params={"session_key": session_key}) or []
    messages: List[RaceControlMessage] = []
    track_statuses: List[Dict[str, Any]] = []

    for msg in raw:
        d_str = msg.get("date")
        if not d_str:
            continue
        try:
            msg_t = (pd.to_datetime(d_str) - t0).total_seconds()
        except Exception:
            continue

        d_num = msg.get("driver_number")
        drv_code = [num_to_code[d_num]] if d_num in num_to_code else None

        category = str(msg.get("category") or "Other")
        flag = msg.get("flag")
        text = str(msg.get("message") or "")

        messages.append(
            RaceControlMessage(
                t=float(msg_t),
                lap=int(msg.get("lap_number") or 1),
                category=category,
                flag=flag,
                message=text,
                drivers=drv_code,
            )
        )

        # Track status inference:
        # '1'=green, '2'=yellow, '4'=SC, '5'=red, '6'/'7'=VSC
        u_text = text.upper()
        if "VIRTUAL SAFETY CAR DEPLOYED" in u_text or "VSC DEPLOYED" in u_text:
            track_statuses.append({"start_time": msg_t, "status": "6", "end_time": None})
        elif "SAFETY CAR DEPLOYED" in u_text or "SC DEPLOYED" in u_text:
            track_statuses.append({"start_time": msg_t, "status": "4", "end_time": None})
        elif "RED FLAG" in u_text:
            track_statuses.append({"start_time": msg_t, "status": "5", "end_time": None})
        elif "CLEAR" in u_text or "GREEN FLAG" in u_text or "VSC ENDING" in u_text or "SAFETY CAR IN THIS LAP" in u_text:
            if track_statuses and track_statuses[-1]["end_time"] is None:
                track_statuses[-1]["end_time"] = msg_t

    return sorted(messages, key=lambda m: m.t), track_statuses


def _fetch_driver_telemetry(
    session_key: int,
    driver_number: int,
    d1_start: str,
    d1_end: str,
) -> Tuple[int, List[dict], List[dict]]:
    """Fetch raw location and car_data for a single driver."""
    r_loc = _safe_get(
        f"{OPENF1_BASE_URL}/location",
        params={
            "session_key": session_key,
            "driver_number": driver_number,
            "date>=": d1_start,
            "date<=": d1_end,
        },
    ) or []

    r_car = _safe_get(
        f"{OPENF1_BASE_URL}/car_data",
        params={
            "session_key": session_key,
            "driver_number": driver_number,
            "date>=": d1_start,
            "date<=": d1_end,
        },
    ) or []

    return driver_number, r_loc, r_car


def load_openf1_session(
    year: int,
    round_num: int,
    session_type: str = "R",
    progress_cb: Optional[Callable[[str, float, str], None]] = None,
) -> Dict[str, Any]:
    """High-level OpenF1 session loader.

    Fetches, resamples, and synchronizes all session data into the exact format
    expected by FrameStore.from_frames and LoadedSession.
    """
    if progress_cb:
        progress_cb("downloading", 0.10, f"Querying OpenF1 API for {year} Round {round_num}...")

    session_meta_raw = get_openf1_session_key(year, round_num, session_type)
    if not session_meta_raw:
        raise ValueError(f"OpenF1 has no matching session for year={year}, round={round_num}, type={session_type}")

    session_key = session_meta_raw["session_key"]
    circuit_name = session_meta_raw.get("circuit_short_name") or session_meta_raw.get("location") or "Unknown"
    country = session_meta_raw.get("country_name") or ""
    event_name = f"{country} Grand Prix"
    date_str = str(session_meta_raw.get("date_start", "")[:10])

    if progress_cb:
        progress_cb("downloading", 0.20, f"Found OpenF1 session {session_key} ({circuit_name}). Fetching roster...")

    drivers, num_to_code, code_to_num = fetch_openf1_drivers(session_key)
    if not drivers:
        raise ValueError(f"OpenF1 returned 0 drivers for session {session_key}")

    laps, stints, detected_laps = fetch_openf1_laps_and_stints(session_key, num_to_code)

    # Determine race start (t0) and race finish (t_end)
    raw_laps_1 = [l for l in laps if l.lap == 1]
    # Pick t0 from raw laps if available, or session date_start
    raw_laps_all = _safe_get(f"{OPENF1_BASE_URL}/laps", params={"session_key": session_key, "lap_number": 1}) or []
    if raw_laps_all and raw_laps_all[0].get("date_start"):
        t0 = pd.to_datetime(raw_laps_all[0]["date_start"])
    else:
        t0 = pd.to_datetime(session_meta_raw["date_start"])

    # Session window: from 10s before lights-out to 60s after race conclusion
    all_laps_raw = _safe_get(f"{OPENF1_BASE_URL}/laps", params={"session_key": session_key}) or []
    total_laps = detected_laps or 50

    finish_t = t0 + pd.Timedelta(hours=2) # fallback
    if all_laps_raw:
        max_lap_records = [l for l in all_laps_raw if l.get("lap_number") == total_laps and l.get("lap_duration")]
        if max_lap_records and max_lap_records[0].get("date_start"):
            rec = max_lap_records[0]
            finish_t = pd.to_datetime(rec["date_start"]) + pd.Timedelta(seconds=rec["lap_duration"]) + pd.Timedelta(seconds=60)

    t_window_start = t0 - pd.Timedelta(seconds=10)
    t_window_end = finish_t + pd.Timedelta(seconds=15)
    duration_sec = max(60.0, (t_window_end - t_window_start).total_seconds())
    num_frames = int(round(duration_sec * FPS))

    if progress_cb:
        progress_cb("downloading", 0.30, f"Downloading telemetry for {len(drivers)} drivers...")

    # Fetch weather and race control
    weather = fetch_openf1_weather(session_key, t0)
    race_control, track_statuses = fetch_openf1_race_control(session_key, t0, num_to_code)

    # Fetch raw driver telemetry in parallel
    driver_telemetry: Dict[str, Dict[str, Any]] = {}
    d1_start_iso = t_window_start.isoformat()
    d1_end_iso = t_window_end.isoformat()

    with ThreadPoolExecutor(max_workers=5) as executor:
        future_map = {
            executor.submit(_fetch_driver_telemetry, session_key, d.number, d1_start_iso, d1_end_iso): d
            for d in drivers
        }
        completed_count = 0
        for future in as_completed(future_map):
            d = future_map[future]
            completed_count += 1
            if progress_cb:
                pct = 0.30 + (0.35 * (completed_count / len(drivers)))
                progress_cb("downloading", pct, f"Fetched telemetry for {d.code} ({completed_count}/{len(drivers)})...")
            try:
                drv_num, loc_records, car_records = future.result()
                driver_telemetry[d.code] = {
                    "loc": loc_records,
                    "car": car_records,
                }
            except Exception as e:
                logger.warning("Failed to fetch telemetry for %s: %s", d.code, e)
                driver_telemetry[d.code] = {"loc": [], "car": []}

    # Build reference lap for TrackGeometry from fastest lap
    if progress_cb:
        progress_cb("resampling", 0.68, "Building track geometry from fastest lap...")

    example_lap_tel = None
    valid_laps_for_geom = [l for l in all_laps_raw if l.get("lap_duration") and not l.get("is_pit_out_lap")]
    if valid_laps_for_geom:
        fastest_geom_lap = min(valid_laps_for_geom, key=lambda l: l["lap_duration"])
        f_drv_num = fastest_geom_lap.get("driver_number")
        f_code = num_to_code.get(f_drv_num)
        f_start = pd.to_datetime(fastest_geom_lap["date_start"])
        f_end = f_start + pd.Timedelta(seconds=fastest_geom_lap["lap_duration"])

        # Extract fastest lap slice from already fetched driver telemetry
        if f_code and f_code in driver_telemetry and driver_telemetry[f_code]["loc"]:
            locs = driver_telemetry[f_code]["loc"]
            lap_locs = [
                pt for pt in locs
                if f_start <= pd.to_datetime(pt.get("date")) <= f_end
            ]
            if len(lap_locs) >= 20:
                df_geom = pd.DataFrame(lap_locs).rename(columns={"x": "X", "y": "Y"})
                df_geom["DRS"] = 0
                example_lap_tel = df_geom

    track = build_track_geometry(example_lap_tel)

    if progress_cb:
        progress_cb("resampling", 0.75, "Resampling driver streams to 25 Hz timeline...")

    # Build uniform 25 Hz time grid
    # grid_t: seconds relative to t_window_start
    grid_t = np.linspace(0.0, duration_sec, num_frames, endpoint=False)
    # Target frame container
    frames: List[Dict[str, Any]] = [
        {"t": float(grid_t[i]), "drivers": {}}
        for i in range(num_frames)
    ]

    # Pre-map stints and laps for fast lookup per driver
    # drv_stints: code -> list of (lap_start, lap_end, compound_int, age_start)
    drv_stint_lookup: Dict[str, List[Tuple[int, int, int, int]]] = {}
    for s in stints:
        c_int = get_tyre_compound_int(s.compound)
        drv_stint_lookup.setdefault(s.driver, []).append((s.lap_start, s.lap_end, c_int, 0))

    # drv_lap_times: code -> list of (start_sec, end_sec, lap_number)
    drv_lap_times: Dict[str, List[Tuple[float, float, int, bool]]] = {}
    for l in all_laps_raw:
        c = num_to_code.get(l.get("driver_number"))
        if not c or not l.get("date_start"):
            continue
        try:
            l_start_sec = (pd.to_datetime(l["date_start"]) - t_window_start).total_seconds()
            dur = l.get("lap_duration") or 90.0
            l_end_sec = l_start_sec + dur
            drv_lap_times.setdefault(c, []).append(
                (l_start_sec, l_end_sec, int(l.get("lap_number", 1)), bool(l.get("is_pit_out_lap", False)))
            )
        except Exception:
            continue

    # Interpolate each driver onto 25 Hz frames
    for d in drivers:
        code = d.code
        tel = driver_telemetry.get(code, {})
        locs = tel.get("loc", [])
        cars = tel.get("car", [])

        if not locs or len(locs) < 5:
            continue

        try:
            df_loc = pd.DataFrame(locs)
            df_car = pd.DataFrame(cars)

            df_loc["t"] = (pd.to_datetime(df_loc["date"]) - t_window_start).dt.total_seconds()
            df_loc = df_loc.sort_values("t").drop_duplicates("t")

            # Interpolate coordinates
            x_interp = np.interp(grid_t, df_loc["t"], df_loc["x"], left=df_loc["x"].iloc[0], right=df_loc["x"].iloc[-1])
            y_interp = np.interp(grid_t, df_loc["t"], df_loc["y"], left=df_loc["y"].iloc[0], right=df_loc["y"].iloc[-1])

            # Car data interpolation
            if not df_car.empty and len(df_car) >= 5:
                df_car["t"] = (pd.to_datetime(df_car["date"]) - t_window_start).dt.total_seconds()
                df_car = df_car.sort_values("t").drop_duplicates("t")
                speed_interp = np.interp(grid_t, df_car["t"], df_car["speed"], left=0.0, right=0.0)
                gear_interp = np.interp(grid_t, df_car["t"], df_car["n_gear"], left=0, right=0)
                throttle_interp = np.interp(grid_t, df_car["t"], df_car["throttle"], left=0.0, right=0.0)
                brake_interp = np.interp(grid_t, df_car["t"], df_car["brake"], left=0.0, right=0.0)
                drs_interp = np.interp(grid_t, df_car["t"], df_car["drs"], left=0, right=0)
            else:
                speed_interp = np.zeros(num_frames)
                gear_interp = np.zeros(num_frames)
                throttle_interp = np.zeros(num_frames)
                brake_interp = np.zeros(num_frames)
                drs_interp = np.zeros(num_frames)

            # Driver lap intervals
            lap_intervals = drv_lap_times.get(code, [])
            lap_intervals.sort(key=lambda x: x[0])
            stints_list = drv_stint_lookup.get(code, [])

            cur_lap_idx = 0
            num_intervals = len(lap_intervals)

            # Populate frames for this driver
            for f_idx in range(num_frames):
                t_sec = grid_t[f_idx]

                # Advance lap interval
                while cur_lap_idx < num_intervals - 1 and t_sec > lap_intervals[cur_lap_idx][1]:
                    cur_lap_idx += 1

                current_lap = 1
                in_pit = False
                if num_intervals > 0:
                    current_lap = lap_intervals[cur_lap_idx][2]
                    in_pit = lap_intervals[cur_lap_idx][3]

                # Resolve tyre compound and life
                tyre_comp = 255
                tyre_life = 0
                for s_start, s_end, c_val, age_s in stints_list:
                    if s_start <= current_lap <= s_end:
                        tyre_comp = c_val
                        tyre_life = age_s + (current_lap - s_start)
                        break

                frames[f_idx]["drivers"][code] = {
                    "x": float(x_interp[f_idx]),
                    "y": float(y_interp[f_idx]),
                    "speed": float(speed_interp[f_idx]),
                    "gear": int(round(gear_interp[f_idx])),
                    "throttle": float(throttle_interp[f_idx]),
                    "brake": 1.0 if brake_interp[f_idx] > 0 else 0.0,
                    "drs": int(round(drs_interp[f_idx])),
                    "lap": int(current_lap),
                    "tyre": int(tyre_comp),
                    "tyre_life": int(tyre_life),
                    "in_pit": in_pit,
                }
        except Exception as e:
            logger.warning("Error resampling telemetry for %s: %s", code, e)

    meta = SessionMeta(
        session_id=f"{year}_{round_num}_{session_type}",
        year=year,
        round=round_num,
        type=session_type,
        event_name=event_name,
        circuit_name=circuit_name,
        country=country,
        date=date_str,
        total_laps=total_laps,
        total_frames=num_frames,
        fps=FPS,
        chunk_size=1500,
        duration_sec=duration_sec,
        drivers=drivers,
    )

    return {
        "meta": meta,
        "drivers": drivers,
        "frames": frames,
        "track": track,
        "track_statuses": track_statuses,
        "total_laps": total_laps,
        "laps": laps,
        "stints": stints,
        "weather": weather,
        "race_control": race_control,
    }
