"""Unit tests for EventsService event detection."""

import numpy as np
import pytest

from src.web.schemas.event import RaceEvent
from src.web.schemas.laps import LapRow, Stint
from src.web.schemas.messages import RaceControlMessage
from src.web.services.events_service import EventsService, EventConfig
from src.web.services.frame_store import FrameStore, FPS


def create_synthetic_frame_store(
    num_drivers: int = 4,
    num_frames: int = 500,
    driver_codes: list[str] = None,
) -> FrameStore:
    if driver_codes is None:
        driver_codes = [f"D{i+1}" for i in range(num_drivers)]

    channels: dict[str, np.ndarray] = {
        "x": np.zeros((num_drivers, num_frames), dtype="<f4"),
        "y": np.zeros((num_drivers, num_frames), dtype="<f4"),
        "dist": np.zeros((num_drivers, num_frames), dtype="<f4"),
        "speed": np.full((num_drivers, num_frames), 250.0, dtype="<f4"),
        "throttle": np.full((num_drivers, num_frames), 100.0, dtype="<f4"),
        "brake": np.zeros((num_drivers, num_frames), dtype="<f4"),
        "gear": np.full((num_drivers, num_frames), 7, dtype="<i1"),
        "drs": np.zeros((num_drivers, num_frames), dtype="<u1"),
        "lap": np.ones((num_drivers, num_frames), dtype="<i2"),
        "tyre": np.ones((num_drivers, num_frames), dtype="<u1"),
        "tyreLife": np.zeros((num_drivers, num_frames), dtype="<u1"),
        "position": np.zeros((num_drivers, num_frames), dtype="<u1"),
        "inPit": np.zeros((num_drivers, num_frames), dtype="<u1"),
        "status": np.zeros((num_drivers, num_frames), dtype="<u1"),
        "gapAhead": np.full((num_drivers, num_frames), np.nan, dtype="<f4"),
        "gapLeader": np.zeros((num_drivers, num_frames), dtype="<f4"),
        "trackStatus": np.zeros(num_frames, dtype="<u1"),
        "scX": np.full(num_frames, np.nan, dtype="<f4"),
        "scY": np.full(num_frames, np.nan, dtype="<f4"),
        "scPhase": np.zeros(num_frames, dtype="<u1"),
    }

    # Set default positions 1..num_drivers
    for d in range(num_drivers):
        channels["position"][d, :] = d + 1

    return FrameStore(
        sid="test_session",
        driver_codes=driver_codes,
        channels=channels,
        total_frames=num_frames,
    )


class TestEventsService:
    def test_detect_flags_contiguous_runs(self):
        fs = create_synthetic_frame_store(num_frames=300)
        # Yellow flag at frame 50..100 (code 1)
        fs.channels["trackStatus"][50:101] = 1
        # Safety car at frame 150..250 (code 2)
        fs.channels["trackStatus"][150:251] = 2

        service = EventsService()
        flags = service.detect_flags(fs)
        assert len(flags) == 2

        yellow = flags[0]
        assert yellow.type == "flag"
        assert yellow.label == "Yellow Flag"
        assert yellow.t == round(50 / FPS, 2)
        assert yellow.t_end == round(101 / FPS, 2)

        sc = flags[1]
        assert sc.type == "safety_car"
        assert sc.label == "Safety Car Deployed"
        assert sc.t == round(150 / FPS, 2)
        assert sc.t_end == round(251 / FPS, 2)

    def test_detect_pit_stops_pairing_and_compound(self):
        fs = create_synthetic_frame_store(num_drivers=2, num_frames=300, driver_codes=["VER", "NOR"])
        # VER pits between frame 50 and frame 125 (3 seconds)
        fs.channels["inPit"][0, 50:125] = 1
        fs.channels["lap"][0, :] = 10

        stints = [
            Stint(driver="VER", stint=1, compound="SOFT", lap_start=1, lap_end=9),
            Stint(driver="VER", stint=2, compound="HARD", lap_start=10, lap_end=25),
        ]

        service = EventsService()
        pit_events = service.detect_pit_stops(fs, stints)
        assert len(pit_events) == 2

        pit_in = pit_events[0]
        assert pit_in.type == "pit_in"
        assert pit_in.drivers == ["VER"]
        assert pit_in.t == round(50 / FPS, 2)

        pit_out = pit_events[1]
        assert pit_out.type == "pit_out"
        assert pit_out.drivers == ["VER"]
        assert pit_out.t == round(125 / FPS, 2)
        assert "HARD" in pit_out.label
        assert pit_out.meta["compound"] == "HARD"

    def test_detect_retirements(self):
        fs = create_synthetic_frame_store(num_drivers=2, num_frames=200, driver_codes=["VER", "ALB"])
        # ALB retires at frame 75
        fs.channels["status"][1, 75:] = 1

        service = EventsService()
        retirements = service.detect_retirements(fs)
        assert len(retirements) == 1
        assert retirements[0].type == "retirement"
        assert retirements[0].drivers == ["ALB"]
        assert retirements[0].t == round(75 / FPS, 2)
        assert retirements[0].severity == "major"

    def test_detect_overtakes_stable_pass(self):
        # 25 fps, 1000 frames (40s)
        fs = create_synthetic_frame_store(num_drivers=2, num_frames=1000, driver_codes=["VER", "NOR"])
        # Initially VER is P1, NOR is P2
        fs.channels["position"][0, :300] = 1
        fs.channels["position"][1, :300] = 2

        # At frame 300 (t=12s), NOR overtakes VER for P1 and stays ahead stably
        fs.channels["position"][0, 300:] = 2
        fs.channels["position"][1, 300:] = 1

        service = EventsService(EventConfig(overtake_stable_sec=3.0, start_ignore_sec=8.0))
        overtakes = service.detect_overtakes(fs)

        assert len(overtakes) == 1
        ot = overtakes[0]
        assert ot.type == "overtake"
        assert ot.drivers == ["NOR", "VER"]
        assert ot.meta["overtakingDriver"] == "NOR"
        assert ot.meta["defendingDriver"] == "VER"
        assert ot.meta["newPosition"] == 1
        assert ot.severity == "major"  # P1 <= P5 is major

    def test_detect_overtakes_ignores_start_shuffle(self):
        fs = create_synthetic_frame_store(num_drivers=2, num_frames=500, driver_codes=["VER", "NOR"])
        # Swap at frame 50 (t=2s, within 8s start_ignore window)
        fs.channels["position"][0, :50] = 1
        fs.channels["position"][1, :50] = 2
        fs.channels["position"][0, 50:] = 2
        fs.channels["position"][1, 50:] = 1

        service = EventsService(EventConfig(start_ignore_sec=8.0))
        overtakes = service.detect_overtakes(fs)
        assert len(overtakes) == 0

    def test_detect_overtakes_excludes_pit_stops(self):
        fs = create_synthetic_frame_store(num_drivers=2, num_frames=600, driver_codes=["VER", "NOR"])
        # VER is P1, NOR is P2
        fs.channels["position"][0, :300] = 1
        fs.channels["position"][1, :300] = 2
        # Position flip occurs because VER enters pit lane at frame 290
        fs.channels["inPit"][0, 290:350] = 1
        fs.channels["position"][0, 300:] = 2
        fs.channels["position"][1, 300:] = 1

        service = EventsService(EventConfig(overtake_stable_sec=3.0, start_ignore_sec=8.0))
        overtakes = service.detect_overtakes(fs)
        # Should be excluded because VER was in pit lane
        assert len(overtakes) == 0

    def test_detect_overtakes_excludes_retirements(self):
        fs = create_synthetic_frame_store(num_drivers=2, num_frames=600, driver_codes=["VER", "NOR"])
        # VER is P1, NOR is P2
        fs.channels["position"][0, :300] = 1
        fs.channels["position"][1, :300] = 2
        # VER crashes / retires at frame 300
        fs.channels["status"][0, 300:] = 1
        fs.channels["position"][0, 300:] = 2
        fs.channels["position"][1, 300:] = 1

        service = EventsService(EventConfig(overtake_stable_sec=3.0, start_ignore_sec=8.0))
        overtakes = service.detect_overtakes(fs)
        # Excluded because position flip was due to retirement
        assert len(overtakes) == 0

    def test_detect_fastest_laps_progression(self):
        fs = create_synthetic_frame_store(num_drivers=2, num_frames=1000, driver_codes=["VER", "NOR"])
        laps = [
            LapRow(driver="VER", lap=1, time_sec=92.5),
            LapRow(driver="NOR", lap=1, time_sec=93.1),
            LapRow(driver="NOR", lap=2, time_sec=91.8),  # New fastest!
            LapRow(driver="VER", lap=3, time_sec=92.0),  # Not faster than 91.8
            LapRow(driver="VER", lap=4, time_sec=90.5),  # New fastest!
        ]

        service = EventsService()
        fl_events = service.detect_fastest_laps(laps, fs)
        assert len(fl_events) == 3
        assert [e.drivers[0] for e in fl_events] == ["VER", "NOR", "VER"]
        assert [e.meta["timeSec"] for e in fl_events] == [92.5, 91.8, 90.5]

    def test_detect_battles_sustained_interval(self):
        fs = create_synthetic_frame_store(num_drivers=2, num_frames=800, driver_codes=["VER", "NOR"])
        # NOR is P2, running within 0.5s of VER from frame 200 to frame 600 (400 frames = 16s > 15s)
        fs.channels["position"][0, :] = 1
        fs.channels["position"][1, :] = 2
        fs.channels["gapAhead"][1, 200:600] = 0.45

        service = EventsService(EventConfig(battle_gap_sec=1.0, battle_min_sec=15.0))
        battles = service.detect_battles(fs)

        assert len(battles) == 1
        b = battles[0]
        assert b.type == "battle"
        assert b.drivers == ["VER", "NOR"]
        assert b.t == round(200 / FPS, 2)
        assert b.t_end == round(600 / FPS, 2)

    def test_detect_race_control_mapping(self):
        messages = [
            RaceControlMessage(t=45.0, lap=1, category="Flag", flag="YELLOW", message="YELLOW FLAG IN SECTOR 2"),
            RaceControlMessage(t=120.0, lap=2, category="Incident", message="INCIDENT INVOLVING CARS 1 (VER) AND 4 (NOR) UNDER INVESTIGATION", drivers=["VER", "NOR"]),
            RaceControlMessage(t=300.0, lap=4, category="Penalty", message="CAR 4 (NOR) - 5 SECOND TIME PENALTY FOR CAUSING A COLLISION", drivers=["NOR"]),
        ]

        service = EventsService()
        rc_events = service.detect_race_control(messages)
        assert len(rc_events) == 2  # investigation + penalty (pure flag messages handled by trackStatus)
        assert rc_events[0].type == "incident"
        assert rc_events[1].type == "penalty"
        assert rc_events[1].severity == "major"

    def test_suzuka_sanity_and_spot_check(self):
        from pathlib import Path
        from src.web.services.session_service import session_service

        fixture_dir = Path("web/fixtures/suzuka-2026-r3")
        assert fixture_dir.exists()

        session = session_service.load_fixture(fixture_dir, sid="suzuka-2026-r3")
        events = session.events
        assert len(events) > 0

        # Assert plausible event counts
        types = {e.type for e in events}
        assert "start" in types
        assert "overtake" in types
        assert "retirement" in types
        assert "fastest_lap" in types
        assert "finish" in types

        overtakes = [e for e in events if e.type == "overtake"]
        assert 10 <= len(overtakes) <= 150

        retirements = [e for e in events if e.type == "retirement"]
        assert len(retirements) == 2
        ret_drivers = {e.drivers[0] for e in retirements}
        assert ret_drivers == {"ALB", "RIC"}

        # Spot check 3 specific events:
        # 1. Race start at t=0
        start_ev = next(e for e in events if e.type == "start")
        assert start_ev.t == 0.0

        # 2. RIC retirement at t~20.4s
        ric_ret = next(e for e in events if e.type == "retirement" and "RIC" in e.drivers)
        assert 15.0 < ric_ret.t < 25.0

        # 3. ALB retirement at t~23.3s
        alb_ret = next(e for e in events if e.type == "retirement" and "ALB" in e.drivers)
        assert 15.0 < alb_ret.t < 28.0
