"""
Tests for Real Ground-Truth Data Mining Pipeline (Step 1).
Validates feature engineering, kinematic models, discrete-time hazard labels,
overtake label assignment, and schema integrity without requiring large network downloads.
"""

import os
import sys
import tempfile
from pathlib import Path
import numpy as np
import pandas as pd
import pytest

from src.ml.mining import (
    find_heavy_braking_zones,
    compute_braking_proximity,
    compute_driver_clean_air_pace,
    compute_fuel_corrected_degradation_slope,
    compute_pit_loss_delta,
    compute_traffic_rejoin_gap,
    mine_overtake_dataset_from_channels,
    mine_pit_dataset_from_laps,
    save_dataset,
    generate_mock_overtake_dataset,
    generate_mock_pit_dataset,
    FastF1DatasetMiner,
)


def test_no_qt_in_mining_pipeline():
    """Verify src/ml/mining.py and scripts/build_real_datasets.py contain no Qt dependencies."""
    root = Path(__file__).resolve().parent.parent
    mining_file = root / "src" / "ml" / "mining.py"
    cli_file = root / "scripts" / "build_real_datasets.py"

    forbidden_terms = ["PySide", "PyQt", "QtCore", "QtGui", "QtWidgets"]
    for file_path in [mining_file, cli_file]:
        assert file_path.exists(), f"File {file_path} not found"
        content = file_path.read_text(encoding="utf-8")
        for term in forbidden_terms:
            assert term not in content, f"Forbidden Qt dependency '{term}' found in {file_path}"


def test_heavy_braking_zone_detection():
    """Verify heavy braking zones are accurately identified and merged from telemetry arrays."""
    circuit_length = 5000.0
    # Simulate a circuit with two heavy braking zones at ~1200m and ~3500m
    num_pts = 1000
    dist = np.linspace(0, 5000, num_pts)
    speed = np.full(num_pts, 250.0)
    brake = np.zeros(num_pts)

    # Zone 1: braking starts at 1200m
    idx_z1 = int(1200 / 5000 * num_pts)
    brake[idx_z1 : idx_z1 + 10] = 1.0

    # Zone 2: braking starts at 3500m
    idx_z2 = int(3500 / 5000 * num_pts)
    brake[idx_z2 : idx_z2 + 10] = 0.8

    zones = find_heavy_braking_zones(dist, speed, brake, circuit_length=circuit_length)
    assert len(zones) == 2, f"Expected 2 braking zones, found {len(zones)}"
    assert abs(zones[0] - 1200.0) < 50.0
    assert abs(zones[1] - 3500.0) < 50.0


def test_braking_proximity_calculation():
    """Verify proximity metric is high (>0.7) near braking zones and decays smoothly with distance."""
    circuit_length = 5000.0
    zones = [1000.0, 3000.0]

    # Car at 970m (30m before zone 1)
    d_close, prox_close = compute_braking_proximity(970.0, zones, circuit_length)
    assert abs(d_close - 30.0) < 1.0
    assert prox_close > 0.70, f"Expected high proximity at 30m, got {prox_close}"

    # Car at 500m (500m before zone 1)
    d_far, prox_far = compute_braking_proximity(500.0, zones, circuit_length)
    assert abs(d_far - 500.0) < 1.0
    assert prox_far < 0.05, f"Expected low proximity at 500m, got {prox_far}"

    # Empty zones fallback
    d_none, prox_none = compute_braking_proximity(970.0, [], circuit_length)
    assert prox_none == 0.0


def test_clean_air_pace_advantage():
    """Verify clean air vehicle pace advantage correctly differentiates driver capabilities."""
    mock_laps = pd.DataFrame([
        # Driver VER: fast clean air laps (~88.0s)
        {"Driver": "VER", "TrackStatus": "1", "PitInTime": pd.NaT, "PitOutTime": pd.NaT, "LapTime": pd.to_timedelta(88.0, unit="s"), "IsAccurate": True},
        {"Driver": "VER", "TrackStatus": "1", "PitInTime": pd.NaT, "PitOutTime": pd.NaT, "LapTime": pd.to_timedelta(88.2, unit="s"), "IsAccurate": True},
        # Driver PER: slightly slower clean air laps (~89.5s)
        {"Driver": "PER", "TrackStatus": "1", "PitInTime": pd.NaT, "PitOutTime": pd.NaT, "LapTime": pd.to_timedelta(89.5, unit="s"), "IsAccurate": True},
        {"Driver": "PER", "TrackStatus": "1", "PitInTime": pd.NaT, "PitOutTime": pd.NaT, "LapTime": pd.to_timedelta(89.6, unit="s"), "IsAccurate": True},
    ])

    pace_map = compute_driver_clean_air_pace(mock_laps)
    assert "VER" in pace_map
    assert "PER" in pace_map
    assert abs(pace_map["VER"] - 88.1) < 0.2
    assert abs(pace_map["PER"] - 89.55) < 0.2

    # If VER attacks PER: defender_pace (89.55) - attacker_pace (88.1) = +1.45s (VER advantage)
    adv_ver = pace_map["PER"] - pace_map["VER"]
    assert adv_ver > 1.0, f"Expected positive pace advantage for VER, got {adv_ver}"


def test_fuel_corrected_degradation_slope():
    """Verify degradation slope calculation corrects for fuel burn-off."""
    # Stint with constant raw lap times: since car burns ~0.045s/lap fuel,
    # constant lap times imply positive tyre degradation (+0.045 s/lap)
    laps_records = []
    for l in range(1, 8):
        laps_records.append({
            "LapNumber": l,
            "TrackStatus": "1",
            "PitInTime": pd.NaT,
            "PitOutTime": pd.NaT,
            "LapTime": pd.to_timedelta(90.0, unit="s"),  # constant raw time
        })
    df_drv = pd.DataFrame(laps_records)

    slope = compute_fuel_corrected_degradation_slope(
        driver_laps=df_drv,
        current_lap=6,
        stint_start_lap=1,
        window_size=5,
    )
    assert abs(slope - 0.045) < 0.01, f"Expected fuel-corrected slope ~0.045, got {slope}"


def test_pit_loss_delta_neutralization():
    """Verify pit loss deltas across Green, Yellow, VSC, and SC conditions."""
    assert compute_pit_loss_delta(1) == 0.0   # Green flag: baseline loss (0s saved)
    assert compute_pit_loss_delta(2) == 2.0   # Yellow flag: ~2s saved
    assert compute_pit_loss_delta(6) == 8.5   # VSC: ~8.5s saved
    assert compute_pit_loss_delta(7) == 8.5   # VSC: ~8.5s saved
    assert compute_pit_loss_delta(4) == 12.0  # SC: ~12.0s saved
    assert compute_pit_loss_delta(5) == 22.0  # Red flag: free tyre change


def test_traffic_rejoin_gap_projection():
    """Verify traffic rejoin gap correctly detects available air vs dense traffic."""
    # Leader LEC at t=1000s, BOT at t=1020s, HAM at t=1025.0s
    mock_laps = pd.DataFrame([
        {"Driver": "LEC", "LapNumber": 10, "Time": pd.to_timedelta(1000.0, unit="s")},
        {"Driver": "BOT", "LapNumber": 10, "Time": pd.to_timedelta(1020.0, unit="s")},
        {"Driver": "HAM", "LapNumber": 10, "Time": pd.to_timedelta(1025.0, unit="s")},
    ])

    # If LEC pits (losing 22s), projected rejoin is t=1022s
    # Car directly ahead is BOT (t=1020s), gap = 2.0s; car behind is HAM (t=1025s), gap = 3.0s
    # Traffic buffer is 2.0s
    gap = compute_traffic_rejoin_gap(
        driver_code="LEC",
        current_lap=10,
        laps_df=mock_laps,
        pit_loss_sec=22.0,
    )
    assert abs(gap - 2.0) < 0.1, f"Expected rejoin gap to car ahead ~2.0s, got {gap}"


def test_pit_dataset_discrete_hazard_labeling():
    """Verify discrete-time hazard labels (Y_L+1, Y_L+2, Y_L+3) assign correctly based on PitInTime."""
    # Driver pitting on lap 15
    laps_data = []
    for l in range(1, 20):
        pit_in = pd.to_timedelta(1500, unit="s") if l == 15 else pd.NaT
        laps_data.append({
            "Driver": "NOR",
            "LapNumber": l,
            "TotalLaps": 20,
            "Stint": 1 if l <= 15 else 2,
            "Compound": "MEDIUM",
            "TyreLife": l if l <= 15 else (l - 15),
            "PitInTime": pit_in,
            "PitOutTime": pd.to_timedelta(1530, unit="s") if l == 16 else pd.NaT,
            "LapTime": pd.to_timedelta(90.0 + 0.1 * l, unit="s"),
            "Time": pd.to_timedelta(l * 90.0, unit="s"),
            "TrackStatus": "1",
            "Position": 3,
        })
    df_laps = pd.DataFrame(laps_data)

    pit_df = mine_pit_dataset_from_laps(
        session_id="TEST_SESSION",
        circuit_id=1,
        laps_df=df_laps,
    )

    assert not pit_df.empty
    # Schema check
    expected_cols = [
        "session_id", "circuit_id", "driver", "lap_number", "total_laps",
        "position", "stint", "tyre_life", "tyre_compound", "stint_progression_ratio",
        "fuel_corrected_degradation_slope", "pit_loss_delta", "track_status",
        "sc_active", "vsc_active", "traffic_rejoin_gap",
        "target_pit_l1", "target_pit_l2", "target_pit_l3", "target_pit"
    ]
    for col in expected_cols:
        assert col in pit_df.columns, f"Missing expected column {col}"

    # Lap 14: boxes on next lap (L+1) -> Y_L+1=1, Y_L+2=1, Y_L+3=1
    row_14 = pit_df[pit_df["lap_number"] == 14].iloc[0]
    assert row_14["target_pit_l1"] == 1
    assert row_14["target_pit_l2"] == 1
    assert row_14["target_pit_l3"] == 1

    # Lap 13: boxes in 2 laps -> Y_L+1=0, Y_L+2=1, Y_L+3=1
    row_13 = pit_df[pit_df["lap_number"] == 13].iloc[0]
    assert row_13["target_pit_l1"] == 0
    assert row_13["target_pit_l2"] == 1
    assert row_13["target_pit_l3"] == 1

    # Lap 12: boxes in 3 laps -> Y_L+1=0, Y_L+2=0, Y_L+3=1
    row_12 = pit_df[pit_df["lap_number"] == 12].iloc[0]
    assert row_12["target_pit_l1"] == 0
    assert row_12["target_pit_l2"] == 0
    assert row_12["target_pit_l3"] == 1

    # Lap 10: boxes in 5 laps -> all 0
    row_10 = pit_df[pit_df["lap_number"] == 10].iloc[0]
    assert row_10["target_pit_l1"] == 0
    assert row_10["target_pit_l2"] == 0
    assert row_10["target_pit_l3"] == 0


def test_overtake_mining_positive_and_negative_labels():
    """Verify overtake candidate pair mining identifies both stable overtakes (Y=1) and sustained defense (Y=0)."""
    fps = 5
    num_frames = 250  # 50 seconds
    timeline = np.arange(num_frames) / float(fps)
    dt = 1.0 / fps

    # Setup 2 drivers: Driver 0 (Defender), Driver 1 (Attacker)
    # Both start with Attacker closely following Defender (gap = 10m)
    dist = np.zeros((2, num_frames), dtype=np.float32)
    pos = np.zeros((2, num_frames), dtype=np.uint8)

    # First 15 seconds (frames 0..75): Defender in P1, Attacker in P2
    pos[0, :75] = 1
    pos[1, :75] = 2
    dist[0, :75] = 1000.0 + np.arange(75) * 50.0 * dt
    dist[1, :75] = 990.0 + np.arange(75) * 51.0 * dt  # 10m gap closing slightly

    # Case A: Position flip at frame 75 (t=15s), attacker pulls ahead and stays ahead for >= 3s (15 frames)
    pos[0, 75:] = 2  # Defender demoted to P2
    pos[1, 75:] = 1  # Attacker promoted to P1
    dist[0, 75:] = dist[0, 74] + np.arange(num_frames - 75) * 49.0 * dt
    dist[1, 75:] = dist[1, 74] + np.arange(num_frames - 75) * 52.0 * dt

    speed = np.full((2, num_frames), 250.0, dtype=np.float32)
    throttle = np.full((2, num_frames), 95.0, dtype=np.float32)
    brake = np.zeros((2, num_frames), dtype=np.float32)
    drs = np.zeros((2, num_frames), dtype=np.uint8)
    drs[1, :] = 12  # Attacker has DRS
    in_pit = np.zeros((2, num_frames), dtype=np.uint8)
    status = np.zeros((2, num_frames), dtype=np.uint8)
    lap = np.ones((2, num_frames), dtype=np.int16)
    tyre = np.ones((2, num_frames), dtype=np.uint8)
    tyre_life = np.zeros((2, num_frames), dtype=np.float32)

    channels = {
        "dist": dist,
        "speed": speed,
        "throttle": throttle,
        "brake": brake,
        "drs": drs,
        "in_pit": in_pit,
        "status": status,
        "lap": lap,
        "tyre": tyre,
        "tyre_life": tyre_life,
        "position": pos,
    }

    ot_df = mine_overtake_dataset_from_channels(
        session_id="SYNTHETIC_RACE",
        circuit_id=1,
        channels=channels,
        timeline=timeline,
        driver_codes=["DFN", "ATT"],
        circuit_length=5000.0,
        clean_pace_map={"ATT": 88.0, "DFN": 89.0},
        fps=fps,
        sample_stride_sec=1.0,
    )

    assert not ot_df.empty
    # Expected columns check
    expected_cols = [
        "session_id", "circuit_id", "t", "lap", "attacker", "defender",
        "delta_s", "delta_t", "delta_v", "delta_a", "closing_kinetic_energy", "drs_active",
        "clean_air_pace_advantage", "compound_delta", "tyre_age_delta",
        "proximity_to_braking_zone", "dist_to_braking_zone", "euclidean_dist",
        "mean_throttle", "throttle_jerk", "mean_brake", "target_overtake"
    ]
    for col in expected_cols:
        assert col in ot_df.columns, f"Missing column {col} in overtake dataset"

    # Verify positive label exists before flip (e.g. at t=10s, flip happens at t=15s <= 10+10s and is stable)
    positives = ot_df[ot_df["target_overtake"] == 1]
    assert len(positives) > 0, "Expected at least one positive overtake sample before the flip"

    # Verify features are populated with expected types
    sample = positives.iloc[0]
    assert sample["attacker"] == "ATT"
    assert sample["defender"] == "DFN"
    assert sample["drs_active"] == 1
    assert sample["clean_air_pace_advantage"] == 1.0  # 89 - 88
    assert 0 < sample["delta_s"] <= 35.0


def test_mock_dataset_schemas_and_integrity():
    """Verify mock dataset generators produce non-null, properly typed DataFrames matching full schemas."""
    ot_df = generate_mock_overtake_dataset(n_samples=100)
    assert len(ot_df) == 100
    assert ot_df.isna().sum().sum() == 0
    assert set(ot_df["target_overtake"].unique()).issubset({0, 1})

    pit_df = generate_mock_pit_dataset(n_samples=100)
    assert len(pit_df) == 100
    assert pit_df.isna().sum().sum() == 0
    assert set(pit_df["target_pit_l1"].unique()).issubset({0, 1})
    assert set(pit_df["target_pit_l2"].unique()).issubset({0, 1})
    assert set(pit_df["target_pit_l3"].unique()).issubset({0, 1})


def test_dataset_save_csv_and_fallback():
    """Verify dataset exporter saves CSV and handles parquet fallback cleanly."""
    mock_df = generate_mock_overtake_dataset(n_samples=20)
    with tempfile.TemporaryDirectory() as tmpdir:
        csv_path = Path(tmpdir) / "test_data.csv"
        saved_csv = save_dataset(mock_df, csv_path, file_format="csv")
        assert saved_csv.exists()
        loaded = pd.read_csv(saved_csv)
        assert len(loaded) == 20

        # Test Parquet format request (falls back to CSV if pyarrow missing)
        pq_path = Path(tmpdir) / "test_data.parquet"
        saved_pq = save_dataset(mock_df, pq_path, file_format="parquet")
        assert saved_pq.exists()
        assert saved_pq.suffix in (".parquet", ".csv")


def test_cli_script_dry_run_execution():
    """Verify CLI build_real_datasets.py executes cleanly in --dry-run mode."""
    import subprocess

    with tempfile.TemporaryDirectory() as tmpdir:
        cmd = [
            sys.executable,
            "scripts/build_real_datasets.py",
            "--dry-run",
            "--sample-limit",
            "50",
            "--output-dir",
            tmpdir,
        ]
        res = subprocess.run(cmd, capture_output=True, text=True)
        assert res.returncode == 0, f"CLI dry run failed: {res.stderr}"
        assert "Dry run completed successfully" in res.stdout
        assert (Path(tmpdir) / "overtake_dataset.csv").exists()
        assert (Path(tmpdir) / "pit_stop_dataset.csv").exists()


def test_overtake_flip_near_lookahead_horizon_labeled_correctly():
    """
    CRITICAL EDGE CASE TEST:
    Verify that an overtake flip occurring at t=8s (within the 10s lookahead window)
    with >= 3s stability is labeled Y=1, and is NOT misclassified as sustained defense (Y=0).
    """
    fps = 5
    num_frames = 150  # 30 seconds
    timeline = np.arange(num_frames) / float(fps)
    dt = 1.0 / fps

    pos = np.zeros((2, num_frames), dtype=np.uint8)
    dist = np.zeros((2, num_frames), dtype=np.float32)

    # Frame 0 to 40 (0 to 8s): Defender in P1, Attacker in P2 following closely at 10m
    pos[0, :40] = 1
    pos[1, :40] = 2
    dist[0, :40] = 1000.0 + np.arange(40) * 50.0 * dt
    dist[1, :40] = 990.0 + np.arange(40) * 51.0 * dt

    # Frame 40 onwards (t=8s): Attacker flips ahead to P1, defender demoted to P2 for 20 frames (4s >= 3s)
    pos[0, 40:] = 2
    pos[1, 40:] = 1
    dist[0, 40:] = dist[0, 39] + np.arange(num_frames - 40) * 49.0 * dt
    dist[1, 40:] = dist[1, 39] + np.arange(num_frames - 40) * 52.0 * dt

    channels = {
        "dist": dist,
        "speed": np.full((2, num_frames), 250.0, dtype=np.float32),
        "throttle": np.full((2, num_frames), 95.0, dtype=np.float32),
        "brake": np.zeros((2, num_frames), dtype=np.float32),
        "drs": np.zeros((2, num_frames), dtype=np.uint8),
        "in_pit": np.zeros((2, num_frames), dtype=np.uint8),
        "status": np.zeros((2, num_frames), dtype=np.uint8),
        "lap": np.ones((2, num_frames), dtype=np.int16),
        "tyre": np.ones((2, num_frames), dtype=np.uint8),
        "tyre_life": np.zeros((2, num_frames), dtype=np.float32),
        "position": pos,
    }

    ot_df = mine_overtake_dataset_from_channels(
        session_id="HORIZON_TEST",
        circuit_id=1,
        channels=channels,
        timeline=timeline,
        driver_codes=["DFN", "ATT"],
        circuit_length=5000.0,
        clean_pace_map={"ATT": 88.0, "DFN": 89.0},
        fps=fps,
        sample_stride_sec=1.0,
        start_ignore_sec=0.0,
    )

    assert not ot_df.empty
    # At t=0 (frame 0), flip happens at frame 40 (t=8s <= 10s) and stays ahead for >3s
    # It MUST be labeled Y=1, NEVER Y=0!
    positives = ot_df[ot_df["target_overtake"] == 1]
    assert len(positives) > 0, "Flip at t=8s must yield positive overtake label Y=1"


def test_delta_t_following_pair_detection():
    """
    Verify candidate following pairs separated by > 35m (e.g. 55m at 250 km/h,
    where delta_t = 0.792s <= 1.2s) are properly included in the mined dataset.
    """
    fps = 5
    num_frames = 100
    timeline = np.arange(num_frames) / float(fps)
    dt = 1.0 / fps

    pos = np.zeros((2, num_frames), dtype=np.uint8)
    pos[0, :] = 1
    pos[1, :] = 2

    # Defender at 1000m, Attacker at 945m -> delta_s = 55m (> 35m)
    # Speed = 250 km/h (69.44 m/s) -> delta_t = 55 / 69.44 = 0.792s <= 1.2s
    dist = np.zeros((2, num_frames), dtype=np.float32)
    dist[0, :] = 1000.0 + np.arange(num_frames) * (250.0 / 3.6) * dt
    dist[1, :] = 945.0 + np.arange(num_frames) * (250.0 / 3.6) * dt

    channels = {
        "dist": dist,
        "speed": np.full((2, num_frames), 250.0, dtype=np.float32),
        "throttle": np.full((2, num_frames), 95.0, dtype=np.float32),
        "brake": np.zeros((2, num_frames), dtype=np.float32),
        "drs": np.zeros((2, num_frames), dtype=np.uint8),
        "in_pit": np.zeros((2, num_frames), dtype=np.uint8),
        "status": np.zeros((2, num_frames), dtype=np.uint8),
        "lap": np.ones((2, num_frames), dtype=np.int16),
        "tyre": np.ones((2, num_frames), dtype=np.uint8),
        "tyre_life": np.zeros((2, num_frames), dtype=np.float32),
        "position": pos,
    }

    ot_df = mine_overtake_dataset_from_channels(
        session_id="DELTA_T_TEST",
        circuit_id=1,
        channels=channels,
        timeline=timeline,
        driver_codes=["DFN", "ATT"],
        circuit_length=5000.0,
        clean_pace_map={"ATT": 88.0, "DFN": 89.0},
        fps=fps,
        sample_stride_sec=1.0,
    )

    assert not ot_df.empty, "Following pair with delta_s=55m and delta_t <= 1.2s should be mined"
    sample = ot_df.iloc[0]
    assert sample["delta_s"] > 35.0
    assert sample["delta_t"] <= 1.20
    assert sample["target_overtake"] == 0  # Sustained defense


def test_standardize_laps_dataframe_conversion():
    """Verify standardize_laps_dataframe correctly unifies lowercase/alias columns and computes cumulative race Time."""
    from src.ml.mining import standardize_laps_dataframe

    # Simulate LapRow dictionary format
    raw_df = pd.DataFrame([
        {"driver": "VER", "lap": 1, "time_sec": 90.5, "pit_in": False, "compound": "MEDIUM", "tyre_life": 1},
        {"driver": "VER", "lap": 2, "time_sec": 89.2, "pit_in": True, "compound": "MEDIUM", "tyre_life": 2},
        {"driver": "HAM", "lap": 1, "time_sec": 91.0, "pit_in": False, "compound": "HARD", "tyre_life": 1},
        {"driver": "HAM", "lap": 2, "time_sec": 89.8, "pit_in": False, "compound": "HARD", "tyre_life": 2},
    ])

    std_df = standardize_laps_dataframe(raw_df)
    assert "Driver" in std_df.columns
    assert "LapNumber" in std_df.columns
    assert "LapTime" in std_df.columns
    assert "PitInTime" in std_df.columns
    assert "Time" in std_df.columns

    # Cumulative time check
    ver_l2 = std_df[(std_df["Driver"] == "VER") & (std_df["LapNumber"] == 2)].iloc[0]
    assert abs(ver_l2["Time"].total_seconds() - (90.5 + 89.2)) < 0.01
    assert pd.notna(ver_l2["PitInTime"])


def test_mine_from_frame_store_integration():
    """Verify mine_from_frame_store handles web session FrameStore and LapRow models without crashing."""
    from src.web.services.session_service import SessionService
    from src.ml.mining import FastF1DatasetMiner

    service = SessionService()
    sess = service.load_from_disk("2026_1_R")
    if sess is None or sess.frame_store is None:
        pytest.skip("Precomputed session 2026_1_R not found on disk")

    laps_df = pd.DataFrame([lap.model_dump() for lap in sess.laps])
    miner = FastF1DatasetMiner()
    circuit_length = getattr(sess.track, "length_m", 5412.0)

    ot_df, pit_df = miner.mine_from_frame_store(
        session_id="2026_1_R",
        circuit_id=1,
        frame_store=sess.frame_store,
        laps_df=laps_df,
        circuit_length=circuit_length,
        max_samples_per_race=200,
    )

    assert not ot_df.empty, "FrameStore overtake dataset should not be empty"
    assert not pit_df.empty, "FrameStore pit stop dataset should not be empty"
    # Ensure pace advantages are non-zero (demonstrating clean air pace mapping works)
    assert ot_df["clean_air_pace_advantage"].nunique() > 1
    # Ensure pit stops were recognized from pit_in
    assert pit_df["target_pit_l1"].sum() > 0
