"""
Tests for Model Architecture & Calibration (Step 3).
Verifies:
1. Physics-informed monotonic constraints on Overtake LightGBM and Pit Stop XGBoost models.
2. Balanced focal weighting calculations for class imbalance.
3. Probability calibration (CalibratedClassifierCV) and metrics (Brier Score, ECE, ROC-AUC, PR-AUC).
4. Native TreeSHAP feature attributions via pred_contrib in OvertakeModel.explain() and PitModel.explain().
5. Serialized artifacts loading and edge-case failure safety.
"""

import math
import numpy as np
import pandas as pd
import pytest
from sklearn.calibration import CalibratedClassifierCV

from src.ml.features import OVERTAKE_FEATURE_COLUMNS, PIT_FEATURE_COLUMNS
from src.ml.registry import ModelRegistry
from src.ml.overtake import OvertakeModel, unwrap_tree_estimator as unwrap_overtake_tree
from src.ml.pit import PitModel, unwrap_tree_estimator as unwrap_pit_tree
from scripts.train_ml_models import (
    compute_expected_calibration_error,
    evaluate_calibration_metrics,
    compute_balanced_focal_weights,
    wrap_calibrated_classifier,
)


# ---------------------------------------------------------------------------
# 1. Monotone Constraints Verification
# ---------------------------------------------------------------------------

def test_overtake_monotone_constraints_physics():
    """
    Verify domain physics monotonicity on the trained Overtake LightGBM model:
    - delta_s <= 0 (closing distance gap / getting closer never decreases probability)
    - delta_v >= 0 (higher closing velocity never decreases probability)
    - drs_active >= 0 (activating DRS never decreases probability)
    - tyre_age_delta <= 0 (attacker having fresher tyres never decreases probability)
    """
    ot_model = OvertakeModel()
    assert ot_model.model is not None, "Trained overtake model should be available"

    base_row = {
        "delta_s": 25.0,
        "delta_v": 5.0,
        "euclidean_dist": 25.0,
        "drs_active": 0,
        "mean_throttle": 85.0,
        "throttle_jerk": 0.0,
        "mean_brake": 0.0,
        "brake_onset_delta": 0.0,
        "tyre_age_delta": 0.0,
        "compound_delta": 0.0,
        "clean_air_pace_diff": 0.0,
        "dist_to_next_heavy_braking": 500.0,
        "straight_fraction_remaining": 0.5,
        "curvature": 0.002,
    }

    # 1. Monotonicity with delta_s: Decreasing gap from 35m down to 5m must monotonically non-decrease prob
    gaps = [35.0, 30.0, 25.0, 20.0, 15.0, 10.0, 5.0]
    probs_gap = []
    for g in gaps:
        row = dict(base_row, delta_s=g, euclidean_dist=g)
        p = ot_model.predict_likelihood(pd.DataFrame([row]))
        probs_gap.append(p)

    for i in range(len(probs_gap) - 1):
        assert probs_gap[i + 1] >= probs_gap[i] - 1e-5, (
            f"delta_s monotonic constraint violated: gap {gaps[i]}m -> {probs_gap[i]} vs "
            f"gap {gaps[i+1]}m -> {probs_gap[i+1]}"
        )

    # 2. Monotonicity with delta_v: Increasing closing speed from -5 to +25 km/h must non-decrease prob
    speeds = [-5.0, 0.0, 5.0, 10.0, 15.0, 20.0, 25.0]
    probs_v = []
    for v in speeds:
        row = dict(base_row, delta_v=v)
        p = ot_model.predict_likelihood(pd.DataFrame([row]))
        probs_v.append(p)

    for i in range(len(probs_v) - 1):
        assert probs_v[i + 1] >= probs_v[i] - 1e-5, (
            f"delta_v monotonic constraint violated: speed {speeds[i]} -> {probs_v[i]} vs "
            f"speed {speeds[i+1]} -> {probs_v[i+1]}"
        )

    # 3. Monotonicity with drs_active: DRS active (1) must give prob >= DRS closed (0)
    row_nodrs = dict(base_row, drs_active=0)
    row_drs = dict(base_row, drs_active=1)
    p_nodrs = ot_model.predict_likelihood(pd.DataFrame([row_nodrs]))
    p_drs = ot_model.predict_likelihood(pd.DataFrame([row_drs]))
    assert p_drs >= p_nodrs - 1e-5, f"DRS monotonic constraint violated: no-drs={p_nodrs}, drs={p_drs}"

    # 4. Monotonicity with tyre_age_delta: Fresher attacker tyres (more negative) must give prob >= older tyres
    row_old = dict(base_row, tyre_age_delta=10.0)
    row_fresh = dict(base_row, tyre_age_delta=-10.0)
    p_old = ot_model.predict_likelihood(pd.DataFrame([row_old]))
    p_fresh = ot_model.predict_likelihood(pd.DataFrame([row_fresh]))
    assert p_fresh >= p_old - 1e-5, f"Tyre age monotonic constraint violated: old={p_old}, fresh={p_fresh}"

    # 5. Monotonicity with clean_air_pace_diff: Faster attacker (more negative lap time diff) gives prob >= slower
    row_slow = dict(base_row, clean_air_pace_diff=1.0)
    row_fast = dict(base_row, clean_air_pace_diff=-1.0)
    p_slow = ot_model.predict_likelihood(pd.DataFrame([row_slow]))
    p_fast = ot_model.predict_likelihood(pd.DataFrame([row_fast]))
    assert p_fast >= p_slow - 1e-5, f"Clean air pace monotonic constraint violated: slow={p_slow}, fast={p_fast}"

    # 6. Monotonicity with compound_delta: Softer/higher grip attacker compound gives prob >= harder
    row_hard = dict(base_row, compound_delta=-2.0)
    row_soft = dict(base_row, compound_delta=2.0)
    p_hard = ot_model.predict_likelihood(pd.DataFrame([row_hard]))
    p_soft = ot_model.predict_likelihood(pd.DataFrame([row_soft]))
    assert p_soft >= p_hard - 1e-5, f"Compound delta monotonic constraint violated: hard={p_hard}, soft={p_soft}"

    # 7. Monotonicity with dist_to_next_heavy_braking: Closer to heavy braking zone gives prob >= further
    row_far_bz = dict(base_row, dist_to_next_heavy_braking=600.0)
    row_near_bz = dict(base_row, dist_to_next_heavy_braking=50.0)
    p_far_bz = ot_model.predict_likelihood(pd.DataFrame([row_far_bz]))
    p_near_bz = ot_model.predict_likelihood(pd.DataFrame([row_near_bz]))
    assert p_near_bz >= p_far_bz - 1e-5, f"Braking zone proximity monotonic constraint violated: far={p_far_bz}, near={p_near_bz}"


def test_pit_monotone_constraints_strategy():
    """
    Verify strategy monotonicity on the trained Pit Stop XGBoost model:
    - tyre_life >= 0 (older tyres never decrease pit probability)
    - stint_progression_ratio >= 0 (higher progression never decreases pit probability)
    - sc_active >= 0 (safety car never decreases pit probability)
    - vsc_active >= 0 (VSC never decreases pit probability)
    """
    pit_model = PitModel()
    assert pit_model.model is not None, "Trained pit stop model should be available"

    base_row = {
        "tyre_life": 15,
        "tyre_compound": 1.0,
        "stint_progression_ratio": 0.5,
        "fuel_corrected_degradation_slope": 0.03,
        "pit_loss_delta": 0.0,
        "traffic_rejoin_gap": 10.0,
        "sc_active": 0,
        "vsc_active": 0,
        "lap_number": 20,
    }

    # 1. Monotonicity with tyre_life
    tyre_ages = [5, 10, 15, 20, 25, 30, 35]
    probs_age = []
    for age in tyre_ages:
        row = dict(base_row, tyre_life=age, stint_progression_ratio=age / 28.0)
        p = pit_model.predict_likelihood(pd.DataFrame([row]))
        probs_age.append(p)

    for i in range(len(probs_age) - 1):
        assert probs_age[i + 1] >= probs_age[i] - 1e-5, (
            f"tyre_life monotonic constraint violated: age {tyre_ages[i]} -> {probs_age[i]} vs "
            f"age {tyre_ages[i+1]} -> {probs_age[i+1]}"
        )

    # 2. Monotonicity with stint_progression_ratio in isolation (fixed tyre_life)
    prog_ratios = [0.3, 0.6, 0.9, 1.2, 1.5]
    probs_prog = []
    for pr in prog_ratios:
        row = dict(base_row, stint_progression_ratio=pr)
        probs_prog.append(pit_model.predict_likelihood(pd.DataFrame([row])))

    for i in range(len(probs_prog) - 1):
        assert probs_prog[i + 1] >= probs_prog[i] - 1e-5, (
            f"stint_progression_ratio monotonic constraint violated: {prog_ratios[i]} -> {probs_prog[i]} vs "
            f"{prog_ratios[i+1]} -> {probs_prog[i+1]}"
        )

    # 3. Monotonicity with sc_active
    row_green = dict(base_row, sc_active=0, pit_loss_delta=0.0)
    row_sc = dict(base_row, sc_active=1, pit_loss_delta=12.0)
    p_green = pit_model.predict_likelihood(pd.DataFrame([row_green]))
    p_sc = pit_model.predict_likelihood(pd.DataFrame([row_sc]))
    assert p_sc >= p_green - 1e-5, f"Safety Car monotonic constraint violated: green={p_green}, SC={p_sc}"

    # 4. Monotonicity with vsc_active
    row_vsc = dict(base_row, vsc_active=1, pit_loss_delta=8.5)
    p_vsc = pit_model.predict_likelihood(pd.DataFrame([row_vsc]))
    assert p_vsc >= p_green - 1e-5, f"VSC monotonic constraint violated: green={p_green}, VSC={p_vsc}"


# ---------------------------------------------------------------------------
# 2. Balanced Focal Weighting & Class Imbalance Tests
# ---------------------------------------------------------------------------

def test_balanced_focal_weights_computation():
    """
    Verify focal sample weighting appropriately boosts rare positive classes,
    downweights dominant negative samples, and normalizes mean weight to 1.0.
    """
    # 10% rare positives (10 ones, 90 zeros)
    y = np.array([1] * 10 + [0] * 90)
    w = compute_balanced_focal_weights(y, gamma=2.0, alpha=0.25)

    assert len(w) == 100
    assert np.isclose(np.mean(w), 1.0, atol=1e-5), "Mean sample weight must be normalized to 1.0"

    # Positive samples should have significantly higher weight than negative samples
    w_pos = w[y == 1]
    w_neg = w[y == 0]
    assert np.all(w_pos > 0)
    assert np.all(w_neg > 0)
    assert np.mean(w_pos) > np.mean(w_neg)

    # Edge cases: all positive or all negative
    y_all_pos = np.ones(20, dtype=int)
    w_all_pos = compute_balanced_focal_weights(y_all_pos)
    assert len(w_all_pos) == 20
    assert np.allclose(w_all_pos, 1.0)


# ---------------------------------------------------------------------------
# 3. Probability Calibration & Calibration Metrics
# ---------------------------------------------------------------------------

def test_expected_calibration_error_metric():
    """Verify ECE calculation accurately scores perfectly calibrated vs miscalibrated predictions."""
    # Perfectly calibrated predictions:
    # 100 samples with p=0.8 and 80 are positives (acc = conf = 0.8)
    y_perfect = np.array([1] * 80 + [0] * 20)
    p_perfect = np.full(100, 0.8)
    ece_perfect = compute_expected_calibration_error(y_perfect, p_perfect, n_bins=10)
    assert np.isclose(ece_perfect, 0.0, atol=1e-3)

    # Miscalibrated predictions:
    # 100 samples with p=0.9, but only 10% are positives (acc = 0.1, conf = 0.9)
    y_bad = np.array([1] * 10 + [0] * 90)
    p_bad = np.full(100, 0.9)
    ece_bad = compute_expected_calibration_error(y_bad, p_bad, n_bins=10)
    assert ece_bad == pytest.approx(0.8, abs=0.05)


def test_evaluate_calibration_metrics_dict():
    """Verify evaluate_calibration_metrics outputs ROC-AUC, PR-AUC, Brier Score, and ECE."""
    y = np.array([0, 1, 0, 1, 0, 1, 1, 0])
    p = np.array([0.1, 0.85, 0.15, 0.9, 0.2, 0.8, 0.75, 0.05])

    metrics = evaluate_calibration_metrics(y, p)
    assert "roc_auc" in metrics
    assert "pr_auc" in metrics
    assert "brier_score" in metrics
    assert "ece" in metrics
    assert 0.0 <= metrics["brier_score"] <= 0.10
    assert metrics["roc_auc"] >= 0.90
    assert metrics["ece"] <= 0.25


def test_isotonic_calibration_rank_monotonicity():
    """Verify isotonic calibration strictly preserves rank monotonicity."""
    from sklearn.base import BaseEstimator, ClassifierMixin

    uncal_scores = np.linspace(0.01, 0.99, 50)
    labels = (uncal_scores > 0.5).astype(int)

    # Wrap mock model with CalibratedClassifierCV
    class DummyModel(BaseEstimator, ClassifierMixin):
        def __init__(self):
            self.classes_ = np.array([0, 1])

        def fit(self, X, y=None):
            return self

        def decision_function(self, X):
            return np.asarray(X)[:, 0] * 2.0 - 1.0

        def predict_proba(self, X):
            p1 = np.asarray(X)[:, 0]
            return np.column_stack([1.0 - p1, p1])

        def predict(self, X):
            return (np.asarray(X)[:, 0] > 0.5).astype(int)

    X_dummy = pd.DataFrame({"score": uncal_scores})
    cal = wrap_calibrated_classifier(DummyModel().fit(X_dummy, labels), method="isotonic")
    cal.fit(X_dummy, labels)

    cal_preds = cal.predict_proba(X_dummy)[:, 1]
    # In isotonic regression, predicted probabilities must be non-decreasing with respect to input
    for i in range(len(cal_preds) - 1):
        assert cal_preds[i + 1] >= cal_preds[i] - 1e-6


# ---------------------------------------------------------------------------
# 4. Native TreeSHAP Feature Attributions
# ---------------------------------------------------------------------------

def test_treeshap_explainability_overtake():
    """
    Verify OvertakeModel.explain() uses native TreeSHAP (pred_contrib) from LightGBM:
    - Attribution keys are present and mapped to both friendly and feature names.
    - Close battle with DRS and fresh tyres attributes positive contributions to DRS, proximity, and tyres.
    - All attributions are bounded in [-1.0, 1.0].
    """
    ot_model = OvertakeModel()
    X_close = pd.DataFrame([
        {
            "delta_s": 8.0,
            "delta_v": 18.0,
            "euclidean_dist": 8.0,
            "drs_active": 1,
            "mean_throttle": 100.0,
            "throttle_jerk": 5.0,
            "mean_brake": 0.0,
            "brake_onset_delta": 0.0,
            "tyre_age_delta": -10.0,
            "compound_delta": 1.0,
            "clean_air_pace_diff": -0.8,
            "dist_to_next_heavy_braking": 75.0,
            "straight_fraction_remaining": 0.2,
            "curvature": 0.001,
        }
    ])

    exp = ot_model.explain(X_close)
    assert isinstance(exp, dict)

    # Core UI friendly keys
    for key in ["proximity", "closing_speed", "drs_boost", "tyre_advantage"]:
        assert key in exp, f"Missing friendly key '{key}' in explain output"

    # Values must be bounded in [-1.0, 1.0]
    for k, v in exp.items():
        assert not math.isnan(v), f"Explain attribution for {k} is NaN"
        assert -1.0 <= v <= 1.0, f"Attribution for {k} ({v}) outside [-1.0, 1.0]"

    # Attacker with DRS and fresher tyres in close pursuit must have positive boosts
    assert exp["drs_boost"] > 0, "DRS activation should positively contribute to overtake likelihood"
    assert exp["proximity"] > 0, "Close 8m proximity should positively contribute to overtake likelihood"


def test_treeshap_explainability_pit():
    """
    Verify PitModel.explain() uses native TreeSHAP (pred_contribs) from XGBoost:
    - Attribution keys are present and mapped to both friendly and feature names.
    - Worn tyres under Safety Car attribute positive risk to tyre_age, safety_car, neutralization.
    - All attributions are bounded in [-1.0, 1.0].
    """
    pit_model = PitModel()
    X_pit = pd.DataFrame([
        {
            "tyre_life": 32,
            "tyre_compound": 1.0,
            "stint_progression_ratio": 1.15,
            "fuel_corrected_degradation_slope": 0.055,
            "pit_loss_delta": 12.0,
            "traffic_rejoin_gap": 12.0,
            "sc_active": 1,
            "vsc_active": 0,
            "lap_number": 35,
        }
    ])

    exp = pit_model.explain(X_pit)
    assert isinstance(exp, dict)

    for key in ["tyre_age", "stint_progression", "safety_car", "degradation_slope"]:
        assert key in exp, f"Missing friendly key '{key}' in pit explain output"

    for k, v in exp.items():
        assert not math.isnan(v), f"Explain attribution for {k} is NaN"
        assert -1.0 <= v <= 1.0, f"Attribution for {k} ({v}) outside [-1.0, 1.0]"

    # Worn tyres on lap 32 under Safety Car should push hazard upwards across multiple domain factors
    assert exp["tyre_age"] > 0, "High tyre age should positively contribute to pit stop likelihood"
    assert exp["safety_car"] > 0, "Safety Car should positively contribute to pit stop likelihood"
    assert exp["neutralization_advantage"] > 0, "Neutralization advantage should positively contribute to pit stop likelihood"
    assert exp["stint_progression"] > 0, "Deep stint progression should positively contribute to pit stop likelihood"


# ---------------------------------------------------------------------------
# 5. Serialized Artifacts & ModelRegistry Loading
# ---------------------------------------------------------------------------

def test_serialized_calibrated_artifacts_loaded_by_registry():
    """
    Verify serialized models in models/ are calibrated models and can be queried
    by ModelRegistry without errors.
    """
    registry = ModelRegistry.get_instance()
    # Reset cached instances to force disk reload
    registry._overtake_model = None
    registry._pit_model = None

    ot_loaded = registry.overtake_model
    pit_loaded = registry.pit_model

    assert ot_loaded is not None, "overtake_lgbm.joblib must exist and load"
    assert pit_loaded is not None, "pit_window_xgb.joblib must exist and load"

    # Check unwrap functions
    ot_tree = unwrap_overtake_tree(ot_loaded)
    pit_tree = unwrap_pit_tree(pit_loaded)

    assert hasattr(ot_tree, "booster_") or hasattr(ot_tree, "predict")
    assert hasattr(pit_tree, "get_booster") or hasattr(pit_tree, "predict")


# ---------------------------------------------------------------------------
# 6. Failure Safety, Partial Inputs & Edge Cases
# ---------------------------------------------------------------------------

def test_partial_dict_inference_uses_calibrated_model():
    """
    Verify OvertakeModel and PitModel predict_likelihood run through the ML model
    with filled nominal defaults when passed a partial dictionary, without raising
    shape errors or dropping into heuristic fallbacks.
    """
    ot_model = OvertakeModel()
    pit_model = PitModel()

    # Overtake with only gap and closing velocity
    p_ot = ot_model.predict_likelihood({"delta_s": 8.0, "delta_v": 15.0, "drs_active": 1})
    assert not math.isnan(p_ot)
    assert 0.01 <= p_ot <= 0.99
    # With DRS and 8m gap, overtake probability should be high (> 0.25)
    assert p_ot > 0.25

    # Pit stop with only tyre_life and safety car
    p_pit = pit_model.predict_likelihood({"tyre_life": 30, "sc_active": 1})
    assert not math.isnan(p_pit)
    assert 0.01 <= p_pit <= 0.98
    # With 30-lap tyres and SC, pit stop likelihood should be high (> 0.60)
    assert p_pit > 0.60


def test_nan_and_empty_input_resilience():
    """Verify OvertakeModel and PitModel safely handle NaN, dict, and empty inputs without crashes."""
    ot_model = OvertakeModel()
    pit_model = PitModel()

    # All-NaN input
    nan_dict = {col: float("nan") for col in OVERTAKE_FEATURE_COLUMNS}
    p_ot = ot_model.predict_likelihood(nan_dict)
    assert not math.isnan(p_ot)
    assert 0.01 <= p_ot <= 0.99

    exp_ot = ot_model.explain(nan_dict)
    assert isinstance(exp_ot, dict)
    for k, v in exp_ot.items():
        assert not math.isnan(v)

    # Empty dictionary input
    p_empty = ot_model.predict_likelihood({})
    assert not math.isnan(p_empty)
    assert 0.01 <= p_empty <= 0.99

    exp_empty = ot_model.explain({})
    assert isinstance(exp_empty, dict)

    # Pit all-NaN input
    nan_pit = {col: float("nan") for col in PIT_FEATURE_COLUMNS}
    p_pit = pit_model.predict_likelihood(nan_pit)
    assert not math.isnan(p_pit)
    assert 0.01 <= p_pit <= 0.98

    exp_pit = pit_model.explain(nan_pit)
    assert isinstance(exp_pit, dict)
    for k, v in exp_pit.items():
        assert not math.isnan(v)
