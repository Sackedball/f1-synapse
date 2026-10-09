"""
Tests for Qt-free ML module extraction (Phase 7 AC1).
Verifies zero Qt imports, feature vector schemas, deterministic inference, and model metadata.
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
    """Verify extracted overtake features match the exact LightGBM model columns."""
    att = {
        "fraction": 0.45,
        "speed": 290.0,
        "x": 100.0,
        "y": 200.0,
        "drs": 12,
        "throttle": 1.0,
        "brake": 0.0,
        "tyre_life": 12,
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
    }

    X, delta_s, delta_v, drs_active = extract_overtake_features(
        att, dfnd, att_code="VER", circuit_len=5807.0
    )

    expected_cols = [
        "delta_s",
        "delta_v",
        "euclidean_dist",
        "drs_active",
        "mean_throttle",
        "throttle_jerk",
        "mean_brake",
        "tyre_age_delta",
    ]
    assert list(X.columns) == expected_cols
    assert delta_s > 0
    assert delta_v == 10.0
    assert drs_active == 1
    assert X.iloc[0]["tyre_age_delta"] == -6.0


def test_overtake_model_inference_and_explainability():
    """Verify OvertakeModel returns valid probabilities in [0.01, 0.99] and explainability dict."""
    model = OvertakeModel()

    # Close battle scenario (fast attacker with DRS, fresh tyres, 10m gap)
    X_close = pd.DataFrame(
        [
            {
                "delta_s": 10.0,
                "delta_v": 15.0,
                "euclidean_dist": 10.0,
                "drs_active": 1,
                "mean_throttle": 1.0,
                "throttle_jerk": 0.0,
                "mean_brake": 0.0,
                "tyre_age_delta": -8.0,
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
                "mean_throttle": 0.8,
                "throttle_jerk": 0.0,
                "mean_brake": 0.0,
                "tyre_age_delta": 5.0,
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


def test_extract_pit_features_schema_and_inference():
    """Verify extracted pit features match XGBoost schema and predict in range [0.01, 0.98]."""
    att = {
        "tyre_life": 28,
        "tyre": 0.0,  # SOFT
        "lap": 28,
    }
    X, tyre_life, tyre_compound = extract_pit_features(att, track_status="4")  # Safety car active

    expected_cols = ["tyre_life", "tyre_compound", "sc_active", "vsc_active", "lap_number"]
    assert list(X.columns) == expected_cols
    assert tyre_life == 28
    assert tyre_compound == 0.0

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
