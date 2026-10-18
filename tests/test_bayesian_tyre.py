"""
Unit and integration tests for Bayesian Tyre Degradation Model & Tyre Estimator.
Verifies dynamic circuit baseline adaptation, active Kalman latent state updates,
non-linear thermal degradation cliff, schema compatibility, and Bayesian credible intervals.
"""

import math
import pytest
import numpy as np
import pandas as pd

from src.bayesian_tyre_model import (
    BayesianTyreDegradationModel,
    StateSpaceConfig,
    TyreCategory,
    COMPOUND_BASE_OFFSETS,
)
from src.ml.tyre import TyreDegradationEstimator
from src.web.schemas.ml import MlDriverTyreTimeline
from src.web.schemas.laps import LapRow, Stint


def _generate_synthetic_laps(
    circuit_median_pace: float,
    num_laps: int = 40,
    driver: str = "VER",
    compound: str = "MEDIUM",
) -> pd.DataFrame:
    """Generate synthetic laps around a specified circuit pace."""
    base_pace = circuit_median_pace + COMPOUND_BASE_OFFSETS.get(compound, 0.0)
    lap_records = []
    tyre_deg = 0.03

    for lap in range(1, num_laps + 1):
        fuel = max(0.0, 110.0 - (lap - 1) * 1.6)
        fuel_penalty = 0.032 * fuel
        wear = (lap - 1) * tyre_deg
        lap_time = base_pace + fuel_penalty + wear + np.random.normal(0, 0.15)
        lap_records.append({
            "Driver": driver,
            "LapNumber": lap,
            "LapTimeSeconds": lap_time,
            "Compound": compound,
            "Stint": 1,
            "TrackCondition": "DRY",
            "PitInTime": pd.NaT,
            "PitOutTime": pd.NaT,
            "TrackStatus": "1",
        })

    return pd.DataFrame(lap_records)


# ---------------------------------------------------------------------------
# 1. Dynamic Circuit Baseline Adaptation (Fixing 69.0s Spielberg Bug)
# ---------------------------------------------------------------------------

def test_dynamic_circuit_baseline_spielberg():
    """Verify dynamic baseline for Spielberg (~69.0s)."""
    model = BayesianTyreDegradationModel()
    laps_df = _generate_synthetic_laps(circuit_median_pace=69.0, num_laps=35)
    
    baseline = model.initialize_circuit_baseline(laps_df)
    assert 68.0 <= baseline <= 70.5
    
    # Check compound offsets
    assert model.tyre_profiles["MEDIUM"].reset_pace == pytest.approx(baseline, abs=0.01)
    assert model.tyre_profiles["SOFT"].reset_pace == pytest.approx(baseline - 0.5, abs=0.01)
    assert model.tyre_profiles["HARD"].reset_pace == pytest.approx(baseline + 0.6, abs=0.01)
    assert model.tyre_profiles["INTERMEDIATE"].reset_pace == pytest.approx(baseline + 5.0, abs=0.01)
    assert model.tyre_profiles["WET"].reset_pace == pytest.approx(baseline + 10.0, abs=0.01)


def test_dynamic_circuit_baseline_silverstone():
    """Verify dynamic baseline for Silverstone (~90.0s)."""
    model = BayesianTyreDegradationModel()
    laps_df = _generate_synthetic_laps(circuit_median_pace=90.0, num_laps=35)
    
    baseline = model.initialize_circuit_baseline(laps_df)
    assert 89.0 <= baseline <= 91.5
    assert model.tyre_profiles["MEDIUM"].reset_pace == pytest.approx(baseline, abs=0.01)
    assert model.tyre_profiles["SOFT"].reset_pace == pytest.approx(baseline - 0.5, abs=0.01)
    assert model.tyre_profiles["HARD"].reset_pace == pytest.approx(baseline + 0.6, abs=0.01)


def test_dynamic_circuit_baseline_spa():
    """Verify dynamic baseline for Spa-Francorchamps (~105.0s)."""
    model = BayesianTyreDegradationModel()
    laps_df = _generate_synthetic_laps(circuit_median_pace=105.0, num_laps=35)
    
    baseline = model.initialize_circuit_baseline(laps_df)
    assert 103.5 <= baseline <= 106.5
    assert model.tyre_profiles["MEDIUM"].reset_pace == pytest.approx(baseline, abs=0.01)
    assert model.tyre_profiles["SOFT"].reset_pace == pytest.approx(baseline - 0.5, abs=0.01)
    assert model.tyre_profiles["HARD"].reset_pace == pytest.approx(baseline + 0.6, abs=0.01)


def test_automatic_baseline_on_fit():
    """Verify fit() automatically updates dynamic circuit baseline."""
    model = BayesianTyreDegradationModel()
    laps_df = _generate_synthetic_laps(circuit_median_pace=82.0, num_laps=35)  # Monza pace
    
    assert model.circuit_baseline == 69.0  # Before fit
    model.fit(laps_df)
    assert 81.0 <= model.circuit_baseline <= 83.5  # After fit adapted to Monza
    assert model.tyre_profiles["MEDIUM"].reset_pace == pytest.approx(model.circuit_baseline, abs=0.01)


# ---------------------------------------------------------------------------
# 2. Activate Latent Kalman Filtered State in Prediction
# ---------------------------------------------------------------------------

def test_kalman_filtering_latent_states_recorded():
    """Verify Kalman filter updates latent states and records them by driver and lap."""
    model = BayesianTyreDegradationModel()
    laps_df = _generate_synthetic_laps(circuit_median_pace=80.0, num_laps=30, driver="HAM")
    model.fit(laps_df)

    assert "HAM" in model._latent_states
    assert len(model._latent_states["HAM"]) > 0
    assert "HAM" in model._latent_by_lap
    assert 10 in model._latent_by_lap["HAM"]
    
    latent_lap10 = model._latent_by_lap["HAM"][10]
    assert "mu" in latent_lap10
    assert "var" in latent_lap10
    assert latent_lap10["mu"] > 0


def test_predict_next_lap_uses_posterior_latent_state():
    """Verify predict_next_lap propagates active Kalman latent state rather than static formula."""
    model = BayesianTyreDegradationModel()
    
    # Generate laps with heavy degradation (tyre blistering)
    laps = []
    base_pace = 80.0
    for lap in range(1, 20):
        # 0.10s per lap degradation (much higher than 0.03 prior)
        fuel = max(0.0, 110.0 - (lap - 1) * 1.6)
        fuel_penalty = 0.032 * fuel
        wear = (lap - 1) * 0.10
        laps.append({
            "Driver": "LEC",
            "LapNumber": lap,
            "LapTimeSeconds": base_pace + fuel_penalty + wear,
            "Compound": "MEDIUM",
            "Stint": 1,
            "TrackCondition": "DRY",
            "PitInTime": pd.NaT,
            "PitOutTime": pd.NaT,
        })
    laps_df = pd.DataFrame(laps)
    model.fit(laps_df)

    # Predict lap 20
    pred_time, std_dev, info = model.predict_next_lap("LEC", current_lap=19, laps_df=laps_df)
    
    # Posterior latent pace should reflect the degraded pace capability (> 80.0s + ~1.5s wear)
    assert info["latent_pace"] > base_pace + 0.5
    # Variance and std_dev should be positive and reasonable
    assert std_dev > 0.0
    assert info["health"] < 100


def test_predict_next_lap_graceful_fallback_on_new_tyre():
    """Verify graceful prior fallback when no prior laps on tyre have been observed."""
    model = BayesianTyreDegradationModel()
    laps_df = _generate_synthetic_laps(circuit_median_pace=75.0, num_laps=15, driver="PIA")
    model.fit(laps_df)

    # Simulate fresh stint (stint 2, lap 16)
    new_laps = laps_df.copy()
    new_laps = pd.concat([
        new_laps,
        pd.DataFrame([{
            "Driver": "PIA",
            "LapNumber": 16,
            "LapTimeSeconds": 75.5,
            "Compound": "HARD",
            "Stint": 2,
            "TrackCondition": "DRY",
            "PitInTime": pd.NaT,
            "PitOutTime": pd.NaT,
        }])
    ], ignore_index=True)

    pred_time, std_dev, info = model.predict_next_lap("PIA", current_lap=16, laps_df=new_laps)
    assert pred_time is not None
    assert info["compound"] == "HARD"
    assert info["laps_on_tyre"] == 1


# ---------------------------------------------------------------------------
# 3. Non-Linear Thermal Degradation Cliff
# ---------------------------------------------------------------------------

def test_thermal_cliff_horizons_and_penalties():
    """Verify compound-specific cliff horizons: Soft (20), Medium (30), Hard (42)."""
    model = BayesianTyreDegradationModel()
    
    # Soft profile
    soft = model.tyre_profiles["SOFT"]
    assert soft.cliff_lap == 20
    assert soft.cliff_factor > 0

    # Medium profile
    med = model.tyre_profiles["MEDIUM"]
    assert med.cliff_lap == 30
    assert med.cliff_factor > 0

    # Hard profile
    hard = model.tyre_profiles["HARD"]
    assert hard.cliff_lap == 42
    assert hard.cliff_factor > 0


def test_thermal_cliff_activation_in_prediction():
    """Verify quadratic cliff is applied beyond cliff lap."""
    model = BayesianTyreDegradationModel()
    
    # Create fake laps for Soft compound up to lap 15 (before cliff) and lap 26 (after cliff)
    laps_pre_cliff = []
    for l in range(1, 16):
        laps_pre_cliff.append({
            "Driver": "NOR",
            "LapNumber": l,
            "LapTimeSeconds": 75.0,
            "Compound": "SOFT",
            "Stint": 1,
            "TrackCondition": "DRY",
            "PitInTime": pd.NaT,
            "PitOutTime": pd.NaT,
        })
    df_pre = pd.DataFrame(laps_pre_cliff)
    model.fit(df_pre)
    _, _, info_pre = model.predict_next_lap("NOR", current_lap=15, laps_df=df_pre)
    assert info_pre["cliff_penalty"] == 0.0

    # Extended to lap 26 on SOFT (past cliff of 20)
    laps_post_cliff = []
    for l in range(1, 27):
        laps_post_cliff.append({
            "Driver": "NOR",
            "LapNumber": l,
            "LapTimeSeconds": 75.0 + (l - 1) * 0.05,
            "Compound": "SOFT",
            "Stint": 1,
            "TrackCondition": "DRY",
            "PitInTime": pd.NaT,
            "PitOutTime": pd.NaT,
        })
    df_post = pd.DataFrame(laps_post_cliff)
    model.fit(df_post)
    _, _, info_post = model.predict_next_lap("NOR", current_lap=26, laps_df=df_post)
    # Beyond cliff: lap 27 on tyre -> (27 - 20)^2 * 0.02 = 49 * 0.02 = 0.98s
    assert info_post["cliff_penalty"] > 0.5
    # Health should drop sharply
    assert info_post["health"] < info_pre["health"]


# ---------------------------------------------------------------------------
# 4. Schema Robustness: FastF1 and Web Schema Compatibility
# ---------------------------------------------------------------------------

def test_prepare_data_fastf1_schema():
    """Verify FastF1 schema (Timedelta LapTime, PitInTime, PitOutTime)."""
    model = BayesianTyreDegradationModel()
    fastf1_df = pd.DataFrame({
        "Driver": ["VER", "VER", "VER", "VER"],
        "LapNumber": [1, 2, 3, 4],
        "LapTime": [
            pd.to_timedelta(85.0, unit="s"),
            pd.to_timedelta(80.2, unit="s"),
            pd.to_timedelta(80.5, unit="s"),
            pd.to_timedelta(80.8, unit="s"),
        ],
        "PitInTime": [pd.NaT] * 4,
        "PitOutTime": [pd.NaT] * 4,
        "Compound": ["SOFT", "SOFT", "SOFT", "SOFT"],
        "Stint": [1, 1, 1, 1],
    })
    cleaned = model._prepare_data(fastf1_df)
    assert len(cleaned) == 3  # Lap 1 excluded as standing start
    assert "LapTimeSeconds" in cleaned.columns
    assert cleaned["LapTimeSeconds"].iloc[0] == pytest.approx(80.2)


def test_prepare_data_web_laprow_schema():
    """Verify Web LapRow schema (driver, lap, timeSec, pitIn, pitOut)."""
    model = BayesianTyreDegradationModel()
    web_df = pd.DataFrame([
        {"driver": "SAI", "lap": 1, "timeSec": 90.0, "compound": "medium", "pitIn": False, "pitOut": False},
        {"driver": "SAI", "lap": 2, "timeSec": 78.5, "compound": "medium", "pitIn": False, "pitOut": False},
        {"driver": "SAI", "lap": 3, "timeSec": 78.7, "compound": "medium", "pitIn": False, "pitOut": False},
        {"driver": "SAI", "lap": 4, "timeSec": 105.0, "compound": "medium", "pitIn": True, "pitOut": False},
    ])
    cleaned = model._prepare_data(web_df)
    # Lap 1 excluded, Lap 4 is pit in (excluded)
    assert len(cleaned) == 2
    assert list(cleaned["LapNumber"]) == [2, 3]
    assert cleaned["Compound"].iloc[0] == "MEDIUM"
    assert "Stint" in cleaned.columns


# ---------------------------------------------------------------------------
# 5. Connect src/ml/tyre.py & Bayesian Credible Intervals
# ---------------------------------------------------------------------------

def test_tyre_estimator_timeline_with_credible_intervals():
    """Verify TyreDegradationEstimator produces point estimates and credible intervals."""
    estimator = TyreDegradationEstimator()

    mock_laps = [
        {"driver": "ALO", "lap": 1, "timeSec": 82.0, "compound": "HARD", "tyre_life": 1},
        {"driver": "ALO", "lap": 2, "timeSec": 76.5, "compound": "HARD", "tyre_life": 2},
        {"driver": "ALO", "lap": 3, "timeSec": 76.7, "compound": "HARD", "tyre_life": 3},
        {"driver": "ALO", "lap": 4, "timeSec": 76.9, "compound": "HARD", "tyre_life": 4},
    ]
    mock_stints = [
        {"driver": "ALO", "stint": 1, "compound": "HARD", "lapStart": 1, "lapEnd": 20}
    ]

    timeline = estimator.compute_driver_tyre_timeline("ALO", mock_laps, mock_stints, total_laps=50)
    assert timeline["driver"] == "ALO"
    assert timeline["laps"] == [1, 2, 3, 4]
    assert len(timeline["paceLossS"]) == 4
    assert len(timeline["credibleIntervalLower"]) == 4
    assert len(timeline["credibleIntervalUpper"]) == 4

    # Credible interval bounds check: lower <= pace_loss <= upper
    for pl, low, up in zip(timeline["paceLossS"], timeline["credibleIntervalLower"], timeline["credibleIntervalUpper"]):
        assert low <= pl <= up

    # Forward projection check (5 laps, strictly increasing, with valid bounds)
    proj = timeline["projectedDegradation"]
    proj_low = timeline["projectedCredibleIntervalLower"]
    proj_up = timeline["projectedCredibleIntervalUpper"]

    assert len(proj) == 5
    assert len(proj_low) == 5
    assert len(proj_up) == 5

    for i in range(len(proj) - 1):
        assert proj[i + 1] > proj[i]
        assert proj_low[i] <= proj[i] <= proj_up[i]


def test_ml_driver_tyre_timeline_pydantic_schema():
    """Verify MlDriverTyreTimeline validates and serializes with credible intervals."""
    data = {
        "driver": "RUS",
        "laps": [1, 2, 3],
        "degradationSPerLap": [0.03, 0.03, 0.03],
        "paceLossS": [0.03, 0.06, 0.09],
        "projectedDegradation": [0.12, 0.15, 0.18, 0.21, 0.24],
        "credibleIntervalLower": [0.0, 0.01, 0.04],
        "credibleIntervalUpper": [0.08, 0.11, 0.14],
        "projectedCredibleIntervalLower": [0.07, 0.10, 0.13, 0.16, 0.19],
        "projectedCredibleIntervalUpper": [0.17, 0.20, 0.23, 0.26, 0.29],
    }

    tl = MlDriverTyreTimeline(**data)
    dumped = tl.model_dump(by_alias=True)

    assert dumped["driver"] == "RUS"
    assert dumped["degradationSPerLap"] == [0.03, 0.03, 0.03]
    assert dumped["paceLossS"] == [0.03, 0.06, 0.09]
    assert dumped["credibleIntervalLower"] == [0.0, 0.01, 0.04]
    assert len(dumped["projectedDegradation"]) == 5


def test_ml_service_tyre_integration():
    """Verify MlService computes Bayesian tyre degradation timelines with credible intervals."""
    from pathlib import Path
    from src.web.services.session_service import session_service
    from src.web.services.ml_service import ml_service
    
    sess = session_service.get_loaded("suzuka-2026-r3")
    if sess is None:
        fix_dir = Path("web/fixtures/suzuka-2026-r3")
        if fix_dir.exists():
            session_service.load_fixture(fix_dir, sid="suzuka-2026-r3")
        sess = session_service.get_loaded("suzuka-2026-r3")

    assert sess is not None
    lap_dicts = [l.model_dump(by_alias=True) for l in sess.laps]
    stint_dicts = [s.model_dump(by_alias=True) for s in sess.stints]
    ml_service.tyre_estimator.fit(pd.DataFrame(lap_dicts))

    for driver in ["VER", "NOR", "HAM", "ALB"]:
        tl = ml_service.tyre_estimator.compute_driver_tyre_timeline(
            driver, lap_dicts, stint_dicts, total_laps=53
        )
        assert tl["driver"] == driver
        assert len(tl["projectedDegradation"]) == 5
        assert len(tl["degradationSPerLap"]) == len(tl["laps"])
        assert len(tl["paceLossS"]) == len(tl["laps"])
        assert len(tl["credibleIntervalLower"]) == len(tl["laps"])
        assert len(tl["credibleIntervalUpper"]) == len(tl["laps"])

        for deg in tl["degradationSPerLap"]:
            assert deg >= 0.0

        for pl, low, up in zip(tl["paceLossS"], tl["credibleIntervalLower"], tl["credibleIntervalUpper"]):
            assert pl >= 0.0
            assert low <= pl <= up

        for p, low, up in zip(tl["projectedDegradation"], tl["projectedCredibleIntervalLower"], tl["projectedCredibleIntervalUpper"]):
            assert low <= p <= up


def test_driver_specific_baseline_differentiation():
    """Verify that fast and slow cars receive distinct driver baselines and fair tyre loss."""
    model = BayesianTyreDegradationModel()
    fast_laps = _generate_synthetic_laps(circuit_median_pace=78.0, num_laps=25, driver="FAST")
    slow_laps = _generate_synthetic_laps(circuit_median_pace=82.0, num_laps=25, driver="SLOW")
    combined = pd.concat([fast_laps, slow_laps], ignore_index=True)

    model.fit(combined)

    assert "FAST" in model.driver_baselines
    assert "SLOW" in model.driver_baselines
    assert model.driver_baselines["FAST"] < model.driver_baselines["SLOW"]
    assert model.driver_baselines["SLOW"] - model.driver_baselines["FAST"] > 3.0

    # Test TyreDegradationEstimator with both drivers
    est = TyreDegradationEstimator()
    est.fit(combined)
    fast_tl = est.compute_driver_tyre_timeline("FAST", combined.to_dict(orient="records"), [])
    slow_tl = est.compute_driver_tyre_timeline("SLOW", combined.to_dict(orient="records"), [])

    # Slow driver's tyre loss on fresh rubber (lap 2) should not have a 4-second offset
    assert slow_tl["paceLossS"][1] < 1.0
    assert fast_tl["paceLossS"][1] < 1.0


def test_predict_next_lap_missing_lap_does_not_leak_future_laps():
    """Verify predict_next_lap does not leak latent states from future laps when current lap is unobserved."""
    model = BayesianTyreDegradationModel()
    # 40 laps total
    full_laps = _generate_synthetic_laps(circuit_median_pace=80.0, num_laps=40, driver="PIA")
    model.fit(full_laps)

    # Simulate a query at lap 10, where lap 10 itself was under safety car (not in _latent_by_lap)
    query_laps = full_laps[full_laps["LapNumber"] <= 10].copy()
    # Remove lap 10 from query
    query_laps = query_laps[query_laps["LapNumber"] != 10]

    pred_time, std_dev, info = model.predict_next_lap("PIA", current_lap=9, laps_df=query_laps)
    assert pred_time is not None
    # Latent pace should be around fresh pace + ~9 laps wear (~80.3s), NOT lap 40 wear (>81.2s)
    assert info["latent_pace"] < 81.0


def test_rapid_stint_switching_front_wing_damage():
    """Verify stability when a driver pits 3 times in 5 laps due to damage."""
    model = BayesianTyreDegradationModel()
    records = [
        {"Driver": "TSU", "LapNumber": 1, "LapTimeSeconds": 85.0, "Compound": "MEDIUM", "Stint": 1, "PitIn": False, "PitOut": False},
        {"Driver": "TSU", "LapNumber": 2, "LapTimeSeconds": 80.0, "Compound": "MEDIUM", "Stint": 1, "PitIn": True, "PitOut": False},
        {"Driver": "TSU", "LapNumber": 3, "LapTimeSeconds": 81.0, "Compound": "HARD", "Stint": 2, "PitIn": True, "PitOut": True},
        {"Driver": "TSU", "LapNumber": 4, "LapTimeSeconds": 82.0, "Compound": "SOFT", "Stint": 3, "PitIn": True, "PitOut": True},
        {"Driver": "TSU", "LapNumber": 5, "LapTimeSeconds": 79.5, "Compound": "HARD", "Stint": 4, "PitIn": False, "PitOut": True},
        {"Driver": "TSU", "LapNumber": 6, "LapTimeSeconds": 79.7, "Compound": "HARD", "Stint": 4, "PitIn": False, "PitOut": False},
    ]
    df = pd.DataFrame(records)
    cleaned = model._prepare_data(df)
    assert not cleaned.empty
    model.fit(cleaned)
    assert model._fitted


def test_prepare_data_with_duplicate_indices():
    """Verify _prepare_data handles DataFrames with duplicate index labels without error or warnings."""
    model = BayesianTyreDegradationModel()
    records = [
        {"driver": "VER", "lap": 2, "timeSec": 80.0, "compound": "MEDIUM", "pitIn": False, "pitOut": False},
        {"driver": "VER", "lap": 3, "timeSec": 80.2, "compound": "MEDIUM", "pitIn": False, "pitOut": False},
    ]
    df = pd.DataFrame(records, index=[0, 0])  # Duplicate index labels
    cleaned = model._prepare_data(df)
    assert len(cleaned) == 2
    assert list(cleaned.index) == [0, 1]
