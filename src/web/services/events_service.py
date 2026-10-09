"""EventsService: Race event detection and timeline indexing."""

from dataclasses import dataclass
import logging
from typing import Any, Dict, List, Optional
import numpy as np

from src.web.schemas.event import RaceEvent, EventType, EventSeverity
from src.web.schemas.laps import LapRow, Stint
from src.web.schemas.messages import RaceControlMessage
from src.web.services.frame_store import FrameStore, FPS

logger = logging.getLogger(__name__)


@dataclass
class EventConfig:
    overtake_stable_sec: float = 3.0
    start_ignore_sec: float = 8.0
    battle_gap_sec: float = 1.0
    battle_min_sec: float = 15.0
    debounce_sec: float = 5.0


def format_lap_time(sec: Optional[float]) -> str:
    if sec is None or sec <= 0:
        return "--:--.---"
    m = int(sec // 60)
    s = sec % 60
    return f"{m}:{s:06.3f}"


class EventsService:
    """Service to detect broadcast race events from frame store and session data."""

    def __init__(self, config: Optional[EventConfig] = None):
        self.config = config or EventConfig()

    def detect_all(
        self,
        frame_store: FrameStore,
        laps: List[LapRow],
        stints: List[Stint],
        race_control: List[RaceControlMessage],
        total_laps: int = 53,
    ) -> List[RaceEvent]:
        events: List[RaceEvent] = []

        # 1. Start and Finish
        events.extend(self.detect_start_and_finish(frame_store, total_laps))

        # 2. Track status flags (Yellow, SC, VSC, Red)
        events.extend(self.detect_flags(frame_store))

        # 3. Pit stops (In / Out paired)
        events.extend(self.detect_pit_stops(frame_store, stints))

        # 4. Retirements (DNF)
        events.extend(self.detect_retirements(frame_store))

        # 5. Overtakes (on-track position flips with stability check)
        events.extend(self.detect_overtakes(frame_store))

        # 6. Fastest laps
        events.extend(self.detect_fastest_laps(laps, frame_store))

        # 7. Battles
        events.extend(self.detect_battles(frame_store))

        # 8. Race Control incidents / penalties
        events.extend(self.detect_race_control(race_control))

        # Sort all events chronologically by t, ties broken by id
        events.sort(key=lambda e: (e.t, e.id))
        return events

    def detect_start_and_finish(
        self, frame_store: FrameStore, total_laps: int
    ) -> List[RaceEvent]:
        events: List[RaceEvent] = []
        if frame_store.total_frames <= 0:
            return events

        # Start event
        events.append(
            RaceEvent(
                id="start_0",
                type="start",
                t=0.0,
                lap=1,
                drivers=frame_store.driver_codes[:3],
                label="Race Start",
                severity="major",
                meta={"totalDrivers": len(frame_store.driver_codes)},
            )
        )

        # Finish event
        finish_t = round(frame_store.total_frames / FPS, 2)
        events.append(
            RaceEvent(
                id=f"finish_{frame_store.total_frames}",
                type="finish",
                t=finish_t,
                lap=total_laps,
                drivers=frame_store.driver_codes[:1],
                label="Chequered Flag",
                severity="major",
                meta={"raceDurationSec": finish_t},
            )
        )
        return events

    def detect_flags(self, frame_store: FrameStore) -> List[RaceEvent]:
        """Detect contiguous non-green trackStatus intervals."""
        events: List[RaceEvent] = []
        if "trackStatus" not in frame_store.channels:
            return events

        track_status = frame_store.channels["trackStatus"]
        lap_channel = frame_store.channels.get("lap")
        num_frames = len(track_status)

        # 0 = green, 1 = yellow, 2 = SC, 3 = red, 4 = VSC, 5 = VSC ending
        i = 0
        while i < num_frames:
            status_code = int(track_status[i])
            if status_code == 0:
                i += 1
                continue

            start_f = i
            # Group contiguous identical codes (or 4 and 5 grouped as VSC)
            while i < num_frames and (
                int(track_status[i]) == status_code
                or (status_code in (4, 5) and int(track_status[i]) in (4, 5))
            ):
                i += 1
            end_f = i - 1

            t_start = round(start_f / FPS, 2)
            t_end = round((end_f + 1) / FPS, 2)
            lap_num = (
                int(lap_channel[0, start_f])
                if lap_channel is not None and lap_channel.ndim == 2
                else 1
            )

            if status_code == 1:
                ev_type: EventType = "flag"
                label = "Yellow Flag"
            elif status_code == 2:
                ev_type = "safety_car"
                label = "Safety Car Deployed"
            elif status_code == 3:
                ev_type = "flag"
                label = "Red Flag"
            else:
                ev_type = "vsc"
                label = "Virtual Safety Car"

            events.append(
                RaceEvent(
                    id=f"flag_{status_code}_{start_f}",
                    type=ev_type,
                    t=t_start,
                    t_end=t_end,
                    lap=max(1, lap_num),
                    drivers=[],
                    label=label,
                    severity="major",
                    meta={
                        "statusCode": status_code,
                        "durationSec": round(t_end - t_start, 2),
                    },
                )
            )
        return events

    def detect_pit_stops(
        self, frame_store: FrameStore, stints: List[Stint]
    ) -> List[RaceEvent]:
        """Detect pit in / out events from inPit channel rising and falling edges."""
        events: List[RaceEvent] = []
        if "inPit" not in frame_store.channels:
            return events

        in_pit = frame_store.channels["inPit"]
        lap_channel = frame_store.channels.get("lap")
        speed_channel = frame_store.channels.get("speed")
        driver_codes = frame_store.driver_codes
        num_drivers, num_frames = in_pit.shape

        for d in range(num_drivers):
            code = driver_codes[d]
            driver_pit = in_pit[d, :]

            # Find contiguous in-pit runs
            f = 0
            stop_idx = 1
            while f < num_frames:
                if driver_pit[f] == 0:
                    f += 1
                    continue

                in_f = f
                while f < num_frames and driver_pit[f] == 1:
                    f += 1
                out_f = f

                t_in = round(in_f / FPS, 2)
                t_out = round(min(out_f, num_frames - 1) / FPS, 2)
                transit_duration = round(t_out - t_in, 2)
                stationary_duration = None
                if speed_channel is not None and in_f < out_f:
                    sub_speed = speed_channel[d, in_f:min(out_f, num_frames)]
                    stationary_frames = int(np.sum(sub_speed < 1.0))
                    if stationary_frames > 0:
                        stationary_duration = round(stationary_frames / FPS, 2)

                lap_in = (
                    int(lap_channel[d, in_f])
                    if lap_channel is not None and in_f < num_frames
                    else 1
                )
                lap_out = (
                    int(lap_channel[d, min(out_f, num_frames - 1)])
                    if lap_channel is not None
                    else lap_in
                )

                # Look up tyre compound from stints if available
                compound = None
                for stint in stints:
                    if (
                        stint.driver == code
                        and stint.lap_start <= lap_out <= stint.lap_end
                    ):
                        compound = stint.compound
                        break

                pit_meta: dict[str, Any] = {
                    "stopIndex": stop_idx,
                    "stopDuration": transit_duration,
                    "pitLaneDuration": transit_duration,
                }
                if stationary_duration is not None:
                    pit_meta["stationaryDuration"] = stationary_duration

                # Pit in event
                events.append(
                    RaceEvent(
                        id=f"pit_in_{code}_{in_f}",
                        type="pit_in",
                        t=t_in,
                        lap=max(1, lap_in),
                        drivers=[code],
                        label=f"{code} Pit In (Stop {stop_idx})",
                        severity="info",
                        meta=pit_meta,
                    )
                )

                # Pit out event
                out_label = (
                    f"{code} Pit Out ({compound})" if compound else f"{code} Pit Out"
                )
                pit_out_meta: dict[str, Any] = {
                    "stopIndex": stop_idx,
                    "stopDuration": transit_duration,
                    "pitLaneDuration": transit_duration,
                    "compound": compound,
                }
                if stationary_duration is not None:
                    pit_out_meta["stationaryDuration"] = stationary_duration

                events.append(
                    RaceEvent(
                        id=f"pit_out_{code}_{out_f}",
                        type="pit_out",
                        t=t_out,
                        lap=max(1, lap_out),
                        drivers=[code],
                        label=out_label,
                        severity="info",
                        meta=pit_out_meta,
                    )
                )
                stop_idx += 1

        return events

    def detect_retirements(self, frame_store: FrameStore) -> List[RaceEvent]:
        """Detect first retirement transition (0 running -> 1 retired) per driver."""
        events: List[RaceEvent] = []
        if "status" not in frame_store.channels:
            return events

        status_channel = frame_store.channels["status"]
        lap_channel = frame_store.channels.get("lap")
        driver_codes = frame_store.driver_codes
        num_drivers, num_frames = status_channel.shape

        for d in range(num_drivers):
            code = driver_codes[d]
            s = status_channel[d, :]

            # Find transition from running (0) to retired (1)
            for f in range(1, num_frames):
                if s[f] == 1 and s[f - 1] == 0:
                    t_ret = round(f / FPS, 2)
                    lap_ret = (
                        int(lap_channel[d, f]) if lap_channel is not None else 1
                    )
                    events.append(
                        RaceEvent(
                            id=f"ret_{code}_{f}",
                            type="retirement",
                            t=t_ret,
                            lap=max(1, lap_ret),
                            drivers=[code],
                            label=f"{code} Retired (DNF)",
                            severity="major",
                            meta={"driver": code, "lap": lap_ret},
                        )
                    )
                    break
        return events

    def detect_overtakes(self, frame_store: FrameStore) -> List[RaceEvent]:
        """
        Detect on-track overtakes.
        Criteria:
        - Position order of driver pair flips
        - Flip is stable for >= overtake_stable_sec
        - Prior order was stable for >= overtake_stable_sec
        - Neither driver in pit lane in [f - stable, f + stable]
        - Neither driver retired in [f - stable, f + stable]
        - Debounced per driver pair within debounce_sec
        - Start ignore window applied (first 8s ignored)
        """
        events: List[RaceEvent] = []
        if "position" not in frame_store.channels:
            return events

        pos = frame_store.channels["position"]
        in_pit = frame_store.channels.get("inPit")
        status = frame_store.channels.get("status")
        lap = frame_store.channels.get("lap")
        driver_codes = frame_store.driver_codes
        num_drivers, num_frames = pos.shape

        stable_frames = int(self.config.overtake_stable_sec * FPS)
        start_ignore_frames = int(self.config.start_ignore_sec * FPS)
        debounce_frames = int(self.config.debounce_sec * FPS)

        # Track last overtake frame between pair to debounce
        last_ot_frame: Dict[tuple, int] = {}

        # Pairwise comparison
        for i in range(num_drivers):
            for j in range(i + 1, num_drivers):
                code_i = driver_codes[i]
                code_j = driver_codes[j]

                pos_i = pos[i, :]
                pos_j = pos[j, :]

                # diff < 0 means i is ahead of j; diff > 0 means j is ahead of i
                diff = pos_i.astype(np.int16) - pos_j.astype(np.int16)

                # Find points where sign changes
                # Sample at 5 Hz (every 5 frames) for performance, then pinpoint exact frame
                stride = 5
                for f in range(start_ignore_frames, num_frames - stable_frames, stride):
                    prev_f = max(start_ignore_frames, f - stride)
                    d_prev = diff[prev_f]
                    d_curr = diff[f]

                    # Check for sign flip between non-equal positions across the stride window
                    if (d_prev > 0 and d_curr < 0) or (d_prev < 0 and d_curr > 0):
                        # Pinpoint exact transition frame in (prev_f, f]
                        exact_f = f
                        for k in range(prev_f + 1, min(f + 1, num_frames)):
                            if (d_prev > 0 and diff[k] < 0) or (
                                d_prev < 0 and diff[k] > 0
                            ):
                                exact_f = k
                                break

                        # Check pair debounce
                        pair_key = (min(i, j), max(i, j))
                        if (
                            pair_key in last_ot_frame
                            and (exact_f - last_ot_frame[pair_key]) < debounce_frames
                        ):
                            continue

                        # Check stability forward
                        f_end = min(exact_f + stable_frames, num_frames)
                        target_sign = -1 if diff[exact_f] < 0 else 1
                        if target_sign == -1:
                            if not np.all(diff[exact_f:f_end] < 0):
                                continue
                        else:
                            if not np.all(diff[exact_f:f_end] > 0):
                                continue

                        # Check stability backward
                        f_back = max(0, exact_f - stable_frames)
                        if target_sign == -1:
                            if not np.all(diff[f_back:exact_f] > 0):
                                continue
                        else:
                            if not np.all(diff[f_back:exact_f] < 0):
                                continue

                        # Check pit lane exclusion
                        w_start = max(0, exact_f - stable_frames)
                        w_end = min(exact_f + stable_frames, num_frames)
                        if in_pit is not None:
                            if np.any(in_pit[i, w_start:w_end] == 1) or np.any(
                                in_pit[j, w_start:w_end] == 1
                            ):
                                continue

                        # Check retirement exclusion
                        if status is not None:
                            if np.any(status[i, w_start:w_end] != 0) or np.any(
                                status[j, w_start:w_end] != 0
                            ):
                                continue

                        # Legitimate on-track overtake!
                        last_ot_frame[pair_key] = exact_f

                        if diff[exact_f] < 0:
                            # i overtook j
                            overtaking, defending = code_i, code_j
                            new_pos = int(pos_i[exact_f])
                            lap_val = (
                                int(lap[i, exact_f]) if lap is not None else 1
                            )
                        else:
                            # j overtook i
                            overtaking, defending = code_j, code_i
                            new_pos = int(pos_j[exact_f])
                            lap_val = (
                                int(lap[j, exact_f]) if lap is not None else 1
                            )

                        t_ot = round(exact_f / FPS, 2)
                        severity: EventSeverity = (
                            "major" if new_pos <= 5 else "minor"
                        )
                        events.append(
                            RaceEvent(
                                id=f"ot_{overtaking}_{defending}_{exact_f}",
                                type="overtake",
                                t=t_ot,
                                lap=max(1, lap_val),
                                drivers=[overtaking, defending],
                                label=f"{overtaking} overtook {defending} for P{new_pos}",
                                severity=severity,
                                meta={
                                    "overtakingDriver": overtaking,
                                    "defendingDriver": defending,
                                    "newPosition": new_pos,
                                },
                            )
                        )
        return events

    def detect_fastest_laps(
        self, laps: List[LapRow], frame_store: FrameStore
    ) -> List[RaceEvent]:
        """Detect progressively fastest laps set during the race."""
        events: List[RaceEvent] = []
        if not laps:
            return events

        # Filter valid timed laps
        valid_laps = [
            l for l in laps if l.time_sec is not None and l.time_sec > 0
        ]
        if not valid_laps:
            return events

        # Sort chronologically by lap number
        valid_laps.sort(key=lambda l: l.lap)

        best_time = float("inf")
        fps = FPS
        num_frames = frame_store.total_frames
        lap_channel = frame_store.channels.get("lap")
        driver_codes = frame_store.driver_codes
        drv_map = {code: idx for idx, code in enumerate(driver_codes)}

        for lap in valid_laps:
            if lap.time_sec < (best_time - 0.001):
                best_time = lap.time_sec

                # Estimate time: locate where driver transitions to lap.lap + 1 in frame_store
                t_est = None
                d_idx = drv_map.get(lap.driver)
                if d_idx is not None and lap_channel is not None:
                    # Scan where lap == lap.lap + 1
                    target_lap = lap.lap + 1
                    matches = np.where(lap_channel[d_idx, :] == target_lap)[0]
                    if len(matches) > 0:
                        t_est = round(matches[0] / fps, 2)

                if t_est is None:
                    # Fallback proportional estimate
                    t_est = round(min(num_frames / fps, lap.lap * 90.0), 2)

                events.append(
                    RaceEvent(
                        id=f"fl_{lap.driver}_{lap.lap}",
                        type="fastest_lap",
                        t=t_est,
                        lap=lap.lap,
                        drivers=[lap.driver],
                        label=f"Fastest Lap: {lap.driver} ({format_lap_time(best_time)})",
                        severity="major",
                        meta={
                            "driver": lap.driver,
                            "timeSec": round(best_time, 3),
                            "lap": lap.lap,
                        },
                    )
                )
        return events

    def detect_battles(self, frame_store: FrameStore) -> List[RaceEvent]:
        """Detect sustained battles (gap <= battle_gap_sec for >= battle_min_sec)."""
        events: List[RaceEvent] = []
        if (
            "gapAhead" not in frame_store.channels
            or "position" not in frame_store.channels
        ):
            return events

        gap_ahead = frame_store.channels["gapAhead"]
        pos = frame_store.channels["position"]
        lap = frame_store.channels.get("lap")
        in_pit = frame_store.channels.get("inPit")
        driver_codes = frame_store.driver_codes
        num_drivers, num_frames = gap_ahead.shape

        min_battle_frames = int(self.config.battle_min_sec * FPS)
        max_gap = self.config.battle_gap_sec
        start_ignore_frames = int(self.config.start_ignore_sec * FPS)

        for d in range(num_drivers):
            code = driver_codes[d]
            gaps = gap_ahead[d, :]

            f = start_ignore_frames
            while f < num_frames:
                # Check for gap within threshold and positive
                if (
                    np.isnan(gaps[f])
                    or gaps[f] <= 0
                    or gaps[f] > max_gap
                    or (in_pit is not None and in_pit[d, f] == 1)
                ):
                    f += 1
                    continue

                start_f = f
                while (
                    f < num_frames
                    and not np.isnan(gaps[f])
                    and 0 < gaps[f] <= max_gap
                    and (in_pit is None or in_pit[d, f] == 0)
                ):
                    f += 1
                end_f = f

                run_len = end_f - start_f
                if run_len >= min_battle_frames:
                    t_start = round(start_f / FPS, 2)
                    t_end = round(end_f / FPS, 2)
                    curr_pos = int(pos[d, start_f])
                    lap_val = int(lap[d, start_f]) if lap is not None else 1

                    # Identify the driver ahead: driver whose position is curr_pos - 1
                    ahead_code = None
                    if curr_pos > 1:
                        for other_d in range(num_drivers):
                            if pos[other_d, start_f] == curr_pos - 1:
                                ahead_code = driver_codes[other_d]
                                break

                    drivers_list = (
                        [ahead_code, code] if ahead_code else [code]
                    )
                    battle_label = (
                        f"Battle: {ahead_code} vs {code} (P{curr_pos - 1})"
                        if ahead_code
                        else f"Battle: {code} (P{curr_pos})"
                    )

                    events.append(
                        RaceEvent(
                            id=f"battle_{code}_{start_f}",
                            type="battle",
                            t=t_start,
                            t_end=t_end,
                            lap=max(1, lap_val),
                            drivers=drivers_list,
                            label=battle_label,
                            severity="minor",
                            meta={
                                "defendingDriver": ahead_code,
                                "attackingDriver": code,
                                "position": curr_pos,
                                "durationSec": round(t_end - t_start, 1),
                            },
                        )
                    )
        return events

    def detect_race_control(
        self, race_control: List[RaceControlMessage]
    ) -> List[RaceEvent]:
        """Map race control messages to incident or penalty events."""
        events: List[RaceEvent] = []
        for idx, msg in enumerate(race_control):
            cat_lower = msg.category.lower()
            msg_lower = msg.message.lower()

            is_penalty = "penalty" in cat_lower or "penalty" in msg_lower
            is_incident = (
                "incident" in cat_lower
                or "incident" in msg_lower
                or "investigation" in cat_lower
                or "investigation" in msg_lower
                or "collision" in cat_lower
                or "collision" in msg_lower
                or "off track" in msg_lower
            )

            if is_penalty or is_incident:
                ev_type: EventType = "penalty" if is_penalty else "incident"
                severity: EventSeverity = (
                    "major"
                    if is_penalty or "disqualified" in msg_lower
                    else "minor"
                )
                events.append(
                    RaceEvent(
                        id=f"rc_{ev_type}_{idx}_{int(msg.t)}",
                        type=ev_type,
                        t=round(msg.t, 2),
                        lap=max(1, msg.lap),
                        drivers=msg.drivers or [],
                        label=msg.message,
                        severity=severity,
                        meta={
                            "category": msg.category,
                            "flag": msg.flag,
                            "originalMessage": msg.message,
                        },
                    )
                )
        return events


events_service = EventsService()
