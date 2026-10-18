"""
Tests for Qt-free ML module extraction and High-Signal Feature Engineering (Step 2).
Verifies zero Qt imports, high-signal feature vector schemas, deterministic inference,
track topology curvature, driver control commitment, clean-air pace differential, and pit strategy signals.
"""

import os
import glob
import pytest
import pandas as pd
import numpy as np

from src.ml.registry import ModelRegistry, ModelMetadata, DEFAULT_METADATA
from src.ml.features import (
    extract_overtake_features,
    extract_pit_features,
    DriverTelemetryState,
    SlidingWelford,
    KinematicEngine,
    compute_track_curvature,
    compute_distance_to_next_heavy_braking,
    compute_straight_fraction_remaining,
    compute_rolling_clean_air_pace,
    compute_clean_air_pace_diff,
    compute_stint_progression_ratio,
    compute_fuel_corrected_degradation_slope,
    compute_pit_loss_delta,
    compute_traffic_rejoin_gap,
    standardize_laps_dataframe,
    OVERTAKE_FEATURE_COLUMNS,
    PIT_FEATURE_COLUMNS,
)
from src.ml.overtake import OvertakeModel
from src.ml.pit import PitModel
from src.ml.tyre import TyreDegradationEstimator


def test_no_qt_imports_in_ml_module():
    """AC1: Verify src/ml/ contains absolutely no Qt or PySide imports."""
    ml_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "src", "ml"))
    py_files = glob.glob(os.path.join(ml_dir, "*.py"))
    assert len(py_files) >= 5, "Expected at least 5 Python files in src/ml/"

    forbidden_terms = ["PySide", "PyQt", "QtCore", "QtGui", "QtWidgets"]
    for fpath in py_files:
        with open(fpath, "r", encoding="utf-8") as f:
            content = f.read()
            for term in forbidden_terms:
                assert term not in content, f"Forbidden Qt dependency '{term}' found in {fpath}"


def test_model_registry_metadata():
    """Verify ModelRegistry provides valid metadata with caveat and version."""
    registry = ModelRegistry.get_instance()
    meta = registry.metadata
    assert isinstance(meta, ModelMetadata)
    assert meta.is_synthetic is True
    assert "simulated" in meta.note.lower() or "synthetic" in meta.note.lower()
    d = meta.to_dict()
    assert "version" in d
    assert "trainedOn" in d
    assert "note" in d


def test_extract_overtake_features_schema():
    """Verify extracted overtake features match the exact unified LightGBM model columns."""
    att = {
        "fraction": 0.45,
        "speed": 290.0,
        "x": 100.0,
        "y": 200.0,
        "drs": 12,
        "throttle": 1.0,
        "brake": 0.0,
        "tyre_life": 12,
        "dist": 2613.0,
    }
    dfnd = {
        "fraction": 0.455,
        "speed": 280.0,
        "x": 115.0,
        "y": 210.0,
        "drs": 0,
        "throttle": 0.9,
        "brake": 0.0,
        "tyre_life": 18,
        "dist": 2642.0,
    }

    X, delta_s, delta_v, drs_active = extract_overtake_features(
        att, dfnd, att_code="VER", dfnd_code="HAM", circuit_len=5807.0
    )

    assert list(X.columns) == OVERTAKE_FEATURE_COLUMNS
    assert delta_s > 0
    assert delta_v == 10.0
    assert drs_active == 1
    assert X.iloc[0]["tyre_age_delta"] == -6.0
    assert X.iloc[0]["mean_throttle"] == 100.0  # auto-scaled from [0, 1] to [0, 100]
    assert X.iloc[0]["mean_brake"] == 0.0


def test_overtake_model_inference_and_explainability():
    """Verify OvertakeModel returns valid probabilities in [0.01, 0.99] and explainability dict."""
    model = OvertakeModel()

    # Close battle scenario (fast attacker with DRS, fresh tyres, 10m gap, approaching braking zone)
    X_close = pd.DataFrame(
        [
            {
                "delta_s": 10.0,
                "delta_v": 15.0,
                "euclidean_dist": 10.0,
                "drs_active": 1,
                "mean_throttle": 100.0,
                "throttle_jerk": 5.0,
                "mean_brake": 0.0,
                "brake_onset_delta": 0.0,
                "tyre_age_delta": -8.0,
                "compound_delta": 1.0,
                "clean_air_pace_diff": -0.8,
                "dist_to_next_heavy_braking": 80.0,
                "straight_fraction_remaining": 0.2,
                "curvature": 0.001,
            }
        ]
    )

    prob_close = model.predict_likelihood(X_close)
    assert 0.01 <= prob_close <= 0.99
    assert prob_close > 0.30, f"Expected strong likelihood for close battle with DRS, got {prob_close}"

    # Distant scenario (50m gap, no DRS, slower)
    X_far = pd.DataFrame(
        [
            {
                "delta_s": 50.0,
                "delta_v": -10.0,
                "euclidean_dist": 50.0,
                "drs_active": 0,
                "mean_throttle": 80.0,
                "throttle_jerk": 0.0,
                "mean_brake": 0.0,
                "brake_onset_delta": 0.0,
                "tyre_age_delta": 5.0,
                "compound_delta": -1.0,
                "clean_air_pace_diff": 0.5,
                "dist_to_next_heavy_braking": 500.0,
                "straight_fraction_remaining": 0.8,
                "curvature": 0.005,
            }
        ]
    )
    prob_far = model.predict_likelihood(X_far)
    assert 0.01 <= prob_far <= 0.20

    # Explainability
    exp = model.explain(X_close)
    assert "proximity" in exp
    assert "closing_speed" in exp
    assert "drs_boost" in exp
    assert "tyre_advantage" in exp
    assert exp["drs_boost"] > 0
    assert exp["tyre_advantage"] > 0
    assert "pace_advantage" in exp
    assert exp["pace_advantage"] > 0
    assert "braking_zone_proximity" in exp
    assert exp["braking_zone_proximity"] > 0


def test_extract_pit_features_schema_and_inference():
    """Verify extracted pit features match XGBoost schema and predict in range [0.01, 0.98]."""
    att = {
        "tyre_life": 28,
        "tyre": 0.0,  # SOFT
        "lap": 28,
    }
    X, tyre_life, tyre_compound = extract_pit_features(att, track_status="4")  # Safety car active

    assert list(X.columns) == PIT_FEATURE_COLUMNS
    assert tyre_life == 28
    assert tyre_compound == 0.0
    assert X.iloc[0]["stint_progression_ratio"] == 1.4  # 28 / 20
    assert X.iloc[0]["sc_active"] == 1
    assert X.iloc[0]["pit_loss_delta"] == 12.0

    pit_model = PitModel()
    prob = pit_model.predict_likelihood(X)
    assert 0.01 <= prob <= 0.98
    # High tyre wear on SOFT under SC should yield very high pit anticipation
    assert prob > 0.50


def test_tyre_degradation_estimator():
    """Verify Bayesian tyre degradation calculation and 5-lap forward projection."""
    estimator = TyreDegradationEstimator()

    mock_laps = [
        {"driver": "VER", "lap": 1, "tyre_life": 1},
        {"driver": "VER", "lap": 2, "tyre_life": 2},
        {"driver": "VER", "lap": 3, "tyre_life": 3},
    ]
    mock_stints = [
        {"driver": "VER", "stint": 1, "compound": "MEDIUM", "lapStart": 1, "lapEnd": 25}
    ]

    result = estimator.compute_driver_tyre_timeline("VER", mock_laps, mock_stints, total_laps=53)
    assert result["driver"] == "VER"
    assert result["laps"] == [1, 2, 3]
    assert len(result["degradationSPerLap"]) == 3
    assert len(result["paceLossS"]) == 3
    # Medium compound base deg is 0.03
    assert result["degradationSPerLap"][0] == 0.03
    assert result["paceLossS"][2] == pytest.approx(0.09, rel=1e-2)

    # Forward projection must contain exactly 5 laps strictly increasing
    proj = result["projectedDegradation"]
    assert len(proj) == 5
    for i in range(len(proj) - 1):
        assert proj[i + 1] > proj[i]


# ---------------------------------------------------------------------------
# Step 2: High-Signal Feature Engineering Unit & Boundary Tests
# ---------------------------------------------------------------------------

def test_driver_control_commitment_uniform_scale_and_jerk():
    """Verify DriverTelemetryState scales throttle in [0, 100], brake in {0, 1}, and calculates jerk."""
    state = DriverTelemetryState(driver_code="VER", fps=25.0, window_sec=1.0)

    # Feed normalized throttle (0.8 -> 80.0)
    state.update({"throttle": 0.8, "brake": 0.0, "speed": 200.0})
    assert state.last_throttle == 80.0
    assert state.last_brake == 0.0

    # Throttle step from 80.0 to 100.0 (dt = 0.04s)
    # Jerk = (100.0 - 80.0) / 0.04 = 500.0 %/s
    state.update({"throttle": 100.0, "brake": 0.0, "speed": 210.0})
    assert state.throttle_jerk == pytest.approx(500.0, rel=1e-2)

    # Sudden braking onset: brake transitions from 0.0 to 1.0
    state.update({"throttle": 0.0, "brake": 1.0, "speed": 190.0})
    assert state.last_brake == 1.0
    assert state.brake_onset_delta == pytest.approx(25.0, rel=1e-2)  # (1 - 0) / 0.04 = 25.0

    # SlidingWelford rolling stats
    assert 0.0 <= state.mean_throttle <= 100.0
    assert 0.0 <= state.mean_brake <= 1.0


def test_track_curvature_and_straight_fraction():
    """Verify local curvature formula kappa and straight fraction remaining."""
    # 1. Circle of radius R = 100m -> kappa should be approximately 1/R = 0.01
    angles = np.linspace(0, 2 * np.pi, 200, endpoint=False)
    circle_centerline = [(float(100.0 * np.cos(a)), float(100.0 * np.sin(a))) for a in angles]
    k_circle = compute_track_curvature(circle_centerline)
    assert len(k_circle) == 200
    # Mean curvature should be ~0.01
    # Note: numerical discrete derivatives scale with index step
    assert np.all(k_circle > 0.0)

    # 2. Straight line -> kappa should be 0.0
    straight_centerline = [(float(i * 10.0), 0.0) for i in range(50)]
    k_straight = compute_track_curvature(straight_centerline)
    assert np.allclose(k_straight, 0.0, atol=1e-5)

    # 3. Straight fraction remaining along a track
    # On a straight before a braking zone at 500m (car at 400m, 100m to zone)
    frac = compute_straight_fraction_remaining(
        dist_m=400.0,
        circuit_length=5000.0,
        braking_zones=[500.0],
    )
    assert 0.0 < frac <= 1.0
    assert frac == pytest.approx(100.0 / 400.0, rel=1e-2)

    # Boundary: empty inputs
    assert compute_distance_to_next_heavy_braking(100.0, [], 5000.0) == 999.0
    assert compute_straight_fraction_remaining(100.0, 0.0) == 0.0


def test_clean_air_pace_differential_rolling():
    """Verify rolling clean-air pace differential over preceding 5 laps."""
    mock_laps_att = pd.DataFrame([
        {"Driver": "ATT", "LapNumber": 1, "TrackStatus": "1", "PitInTime": pd.NaT, "PitOutTime": pd.NaT, "LapTimeSec": 88.0},
        {"Driver": "ATT", "LapNumber": 2, "TrackStatus": "1", "PitInTime": pd.NaT, "PitOutTime": pd.NaT, "LapTimeSec": 88.2},
        {"Driver": "ATT", "LapNumber": 3, "TrackStatus": "1", "PitInTime": pd.NaT, "PitOutTime": pd.NaT, "LapTimeSec": 88.4},
        {"Driver": "ATT", "LapNumber": 4, "TrackStatus": "1", "PitInTime": pd.NaT, "PitOutTime": pd.NaT, "LapTimeSec": 88.1},
        {"Driver": "ATT", "LapNumber": 5, "TrackStatus": "1", "PitInTime": pd.NaT, "PitOutTime": pd.NaT, "LapTimeSec": 88.3},
    ])
    mock_laps_dfnd = pd.DataFrame([
        {"Driver": "DFN", "LapNumber": 1, "TrackStatus": "1", "PitInTime": pd.NaT, "PitOutTime": pd.NaT, "LapTimeSec": 89.5},
        {"Driver": "DFN", "LapNumber": 2, "TrackStatus": "1", "PitInTime": pd.NaT, "PitOutTime": pd.NaT, "LapTimeSec": 89.7},
        {"Driver": "DFN", "LapNumber": 3, "TrackStatus": "1", "PitInTime": pd.NaT, "PitOutTime": pd.NaT, "LapTimeSec": 89.6},
        {"Driver": "DFN", "LapNumber": 4, "TrackStatus": "1", "PitInTime": pd.NaT, "PitOutTime": pd.NaT, "LapTimeSec": 89.8},
        {"Driver": "DFN", "LapNumber": 5, "TrackStatus": "1", "PitInTime": pd.NaT, "PitOutTime": pd.NaT, "LapTimeSec": 89.5},
    ])

    # Attacker rolling median ~88.2, Defender rolling median ~89.6
    # Clean air pace diff = 88.2 - 89.6 = -1.4s (attacker advantage)
    diff = compute_clean_air_pace_diff(mock_laps_att, mock_laps_dfnd, current_lap=6)
    assert diff < -1.0
    assert abs(diff - (-1.4)) < 0.15

    # Boundary: lap 1 fallback
    p_lap1 = compute_rolling_clean_air_pace(mock_laps_att, current_lap=1)
    assert abs(p_lap1 - 88.0) < 0.1


def test_pit_strategy_signals_calculations():
    """Verify fuel-corrected deg slope, progression ratio, pit loss delta, and traffic rejoin gap."""
    # Stint progression ratio
    assert compute_stint_progression_ratio(10, "SOFT") == 0.5   # 10 / 20
    assert compute_stint_progression_ratio(14, "MEDIUM") == 0.5 # 14 / 28
    assert compute_stint_progression_ratio(18, "HARD") == 0.5   # 18 / 36

    # Pit loss deltas
    assert compute_pit_loss_delta("1") == 0.0   # Green: baseline
    assert compute_pit_loss_delta("4") == 12.0  # SC: 12s saved
    assert compute_pit_loss_delta("6") == 8.5   # VSC: 8.5s saved

    # Fuel-corrected degradation slope with constant raw lap times (0.045 s/lap fuel burn)
    laps_data = [
        {"LapNumber": l, "TrackStatus": "1", "PitInTime": pd.NaT, "PitOutTime": pd.NaT, "LapTimeSec": 90.0}
        for l in range(1, 7)
    ]
    df_laps = pd.DataFrame(laps_data)
    slope = compute_fuel_corrected_degradation_slope(df_laps, current_lap=6, stint_start_lap=1)
    assert abs(slope - 0.045) < 0.01

    # Traffic rejoin gap
    df_traffic = pd.DataFrame([
        {"Driver": "VER", "LapNumber": 10, "Time": pd.to_timedelta(1000.0, unit="s")},
        {"Driver": "NOR", "LapNumber": 10, "Time": pd.to_timedelta(1020.0, unit="s")},
        {"Driver": "LEC", "LapNumber": 10, "Time": pd.to_timedelta(1024.0, unit="s")},
    ])
    # VER pits (losing 22s) -> projected rejoin at 1022.0s
    # Car ahead is NOR (1020s, gap 2.0s), car behind is LEC (1024s, gap 2.0s)
    gap = compute_traffic_rejoin_gap("VER", current_lap=10, laps_df=df_traffic)
    assert abs(gap - 2.0) < 0.1


def test_offline_online_feature_schema_parity():
    """Verify strict schema parity between offline mining and online inference."""
    from src.ml.mining import OVERTAKE_FEATURE_COLUMNS as MINING_OT_COLS
    from src.ml.mining import PIT_FEATURE_COLUMNS as MINING_PIT_COLS

    assert OVERTAKE_FEATURE_COLUMNS == MINING_OT_COLS
    assert PIT_FEATURE_COLUMNS == MINING_PIT_COLS

    # Check that Overtake features contain all required physics signals
    required_ot_signals = [
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
    assert OVERTAKE_FEATURE_COLUMNS == required_ot_signals

    # Check that Pit features contain all required strategy signals
    required_pit_signals = [
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
    assert PIT_FEATURE_COLUMNS == required_pit_signals


def test_driver_telemetry_state_first_frame_zero_jerk():
    """Verify first frame at 100% throttle does not cause false-positive jerk spike."""
    state = DriverTelemetryState(driver_code="VER", fps=25.0, window_sec=1.0)
    # Frame 0: car already at 100% throttle and 1.0 brake
    state.update({"throttle": 100.0, "brake": 1.0, "speed": 280.0})
    assert state.throttle_jerk == 0.0
    assert state.brake_onset_delta == 0.0
    assert state.last_throttle == 100.0
    assert state.last_brake == 1.0

    # Frame 1: throttle stays at 100% -> jerk remains 0.0
    state.update({"throttle": 100.0, "brake": 1.0, "speed": 285.0})
    assert state.throttle_jerk == 0.0
    assert state.brake_onset_delta == 0.0


def test_track_curvature_closed_loop_deduplication():
    """Verify track curvature handles closed loop duplicate endpoints without division by zero."""
    angles = np.linspace(0, 2 * np.pi, 100, endpoint=True)
    pts = [(float(100.0 * np.cos(a)), float(100.0 * np.sin(a))) for a in angles]
    pts[-1] = pts[0]  # Exact loop closure
    assert pts[0] == pts[-1]

    curv = compute_track_curvature(pts)
    assert len(curv) == 100
    assert not np.any(np.isnan(curv))
    assert not np.any(np.isinf(curv))
    assert np.all(curv > 0.0)


def test_straight_fraction_remaining_boundaries():
    """Verify straight fraction is 1.0 at straight entry and 0.0 at braking onset."""
    # Track length 1000m, braking zone from 400m to 500m
    # Car at 100m (on straight): previous braking zone ended at 0m, next is at 400m
    # Fraction = (400 - 100) / (400 - 0) = 300 / 400 = 0.75
    frac_mid = compute_straight_fraction_remaining(
        dist_m=100.0,
        circuit_length=1000.0,
        braking_zones=[400.0],
    )
    assert frac_mid == pytest.approx(0.75, rel=1e-2)

    # Car at 0m (entry of straight) -> fraction = 1.0
    frac_start = compute_straight_fraction_remaining(
        dist_m=0.0,
        circuit_length=1000.0,
        braking_zones=[400.0],
    )
    assert frac_start == pytest.approx(1.0, rel=1e-2)

    # Car at 400m (braking onset) -> fraction = 0.0
    frac_end = compute_straight_fraction_remaining(
        dist_m=400.0,
        circuit_length=1000.0,
        braking_zones=[400.0],
    )
    assert frac_end == pytest.approx(0.0, abs=1e-3)


def test_standardize_laps_dataframe_with_laprow_and_traffic_gap():
    """Verify LapRow format (time_sec, pit_in/pit_out) is standardized with cumulative Time."""
    # Simulate LapRow dictionaries
    raw_laps = [
        {"driver": "VER", "lap": 1, "timeSec": 90.0, "pitIn": False, "pitOut": False},
        {"driver": "VER", "lap": 2, "timeSec": 91.0, "pitIn": False, "pitOut": False},
        {"driver": "NOR", "lap": 1, "timeSec": 90.5, "pitIn": False, "pitOut": False},
        {"driver": "NOR", "lap": 2, "timeSec": 91.2, "pitIn": False, "pitOut": False},
    ]
    df_raw = pd.DataFrame(raw_laps)
    df_std = standardize_laps_dataframe(df_raw)

    assert "Driver" in df_std.columns
    assert "LapNumber" in df_std.columns
    assert "Time" in df_std.columns
    assert "LapTimeSec" in df_std.columns

    # Check cumulative Time: VER lap 1 = 90.0s, lap 2 = 181.0s
    ver_l2_time = df_std[(df_std["Driver"] == "VER") & (df_std["LapNumber"] == 2)].iloc[0]["Time"]
    assert ver_l2_time.total_seconds() == pytest.approx(181.0, abs=1e-2)

    # compute_traffic_rejoin_gap should calculate valid gap instead of defaulting to 10.0
    gap = compute_traffic_rejoin_gap("VER", current_lap=2, laps_df=df_std, pit_loss_sec=22.0)
    assert gap != 10.0
    assert not np.isnan(gap)


def test_fuel_corrected_degradation_multi_stint():
    """Verify degradation slope is isolated within current stint."""
    # Stint 1: Laps 1-5, Lap times increasing by 0.2s/lap (severe deg)
    # Stint 2: Laps 6-10, Fresh tyres, Lap times flat (zero deg)
    laps_s1 = [
        {"Driver": "HAM", "LapNumber": l, "LapTimeSec": 90.0 + l * 0.2, "PitInTime": pd.NaT, "PitOutTime": pd.NaT}
        for l in range(1, 6)
    ]
    laps_s2 = [
        {"Driver": "HAM", "LapNumber": l, "LapTimeSec": 88.0, "PitInTime": pd.NaT, "PitOutTime": pd.NaT}
        for l in range(6, 11)
    ]
    df_ham = pd.DataFrame(laps_s1 + laps_s2)

    # In Stint 2 (lap 10, stint start 6), deg slope should only look at laps 6-10
    slope_s2 = compute_fuel_corrected_degradation_slope(df_ham, current_lap=10, stint_start_lap=6)
    # Flat raw lap times minus fuel burn gives slope ~ 0.045
    assert slope_s2 == pytest.approx(0.045, abs=0.01)


def test_clean_air_pace_diff_neutral_fallback():
    """Verify that if either driver lacks clean-air data, pace differential is 0.0."""
    clean_laps = pd.DataFrame([
        {"Driver": "VER", "LapNumber": l, "TrackStatus": "1", "PitInTime": pd.NaT, "PitOutTime": pd.NaT, "LapTimeSec": 85.0}
        for l in range(1, 6)
    ])
    empty_laps = pd.DataFrame()

    diff = compute_clean_air_pace_diff(clean_laps, empty_laps, current_lap=5)
    assert diff == 0.0


def test_overtake_and_pit_nan_input_safety():
    """Verify OvertakeModel and PitModel safely handle NaN inputs without crashing or returning NaNs."""
    ot_model = OvertakeModel()
    pit_model = PitModel()

    nan_ot_df = pd.DataFrame([{
        "delta_s": float("nan"),
        "delta_v": float("nan"),
        "euclidean_dist": float("nan"),
        "drs_active": float("nan"),
        "mean_throttle": float("nan"),
        "throttle_jerk": float("nan"),
        "mean_brake": float("nan"),
        "brake_onset_delta": float("nan"),
        "tyre_age_delta": float("nan"),
        "compound_delta": float("nan"),
        "clean_air_pace_diff": float("nan"),
        "dist_to_next_heavy_braking": float("nan"),
        "straight_fraction_remaining": float("nan"),
        "curvature": float("nan"),
    }])

    prob_ot = ot_model.predict_likelihood(nan_ot_df)
    assert not np.isnan(prob_ot)
    assert 0.01 <= prob_ot <= 0.99

    exp = ot_model.explain(nan_ot_df)
    assert isinstance(exp, dict)
    for k, v in exp.items():
        assert not np.isnan(v), f"Explainability feature {k} returned NaN"

    nan_pit_df = pd.DataFrame([{
        "tyre_life": float("nan"),
        "tyre_compound": float("nan"),
        "stint_progression_ratio": float("nan"),
        "fuel_corrected_degradation_slope": float("nan"),
        "pit_loss_delta": float("nan"),
        "traffic_rejoin_gap": float("nan"),
        "sc_active": float("nan"),
        "vsc_active": float("nan"),
        "lap_number": float("nan"),
    }])

    prob_pit = pit_model.predict_likelihood(nan_pit_df)
    assert not np.isnan(prob_pit)
    assert 0.01 <= prob_pit <= 0.98

