"""
Comprehensive Unit Tests for Model Evaluation Protocol (Step 6).

Verifies:
1. Expected Calibration Error (ECE) calculation on perfectly calibrated vs miscalibrated predictions.
2. Brier score and PR-AUC calculations, including edge cases (e.g. single-class arrays, empty inputs).
3. Reliability diagram binning (10 bins, sample counts summing to N, monotonic bin bounds).
4. Leave-One-Circuit-Out (LOCO) and Leave-One-Season-Out (LOSO) cross-validation generators
   (zero group leakage, and robust fallback to Stratified K-Fold when group count < 2).
5. Domain heuristic baseline prediction bounds (0 <= P <= 1) and physics responses.
6. Three-tier benchmarking suite (benchmark_overtake_models and benchmark_pit_models) on test slices,
   including tuple unpacking, dictionary access, and Markdown table output.
"""

import math
import numpy as np
import pandas as pd
import pytest

from src.ml.features import OVERTAKE_FEATURE_COLUMNS, PIT_FEATURE_COLUMNS
from src.ml.evaluation import (
    compute_expected_calibration_error,
    compute_brier_score,
    compute_pr_auc,
    compute_roc_auc,
    compute_reliability_diagram_bins,
    evaluate_predictions,
    evaluate_calibration_metrics,
    leave_one_circuit_out_cv,
    leave_one_season_out_cv,
    heuristic_overtake_predict,
    heuristic_pit_predict,
    benchmark_overtake_models,
    benchmark_pit_models,
    BenchmarkReport,
    format_benchmark_markdown_table,
)


# ---------------------------------------------------------------------------
# 1. Calibration & Error Metric Tests
# ---------------------------------------------------------------------------

def test_expected_calibration_error_synthetic():
    """Verify ECE calculation accurately distinguishes calibrated vs miscalibrated distributions."""
    # 1. Perfectly calibrated distribution:
    # 200 samples with p=0.8 where exactly 80% are 1s, and 200 samples with p=0.2 where 20% are 1s
    y_true_perf = np.array([1] * 160 + [0] * 40 + [1] * 40 + [0] * 160)
    y_prob_perf = np.array([0.8] * 200 + [0.2] * 200)

    ece_perf = compute_expected_calibration_error(y_true_perf, y_prob_perf, n_bins=10)
    assert np.isclose(ece_perf, 0.0, atol=1e-3), f"Perfect calibration should have ~0 ECE, got {ece_perf}"

    # 2. Severely miscalibrated distribution:
    # Model predicts 0.95 confidence for 100 samples, but only 5% are positive
    y_true_bad = np.array([1] * 5 + [0] * 95)
    y_prob_bad = np.full(100, 0.95)

    ece_bad = compute_expected_calibration_error(y_true_bad, y_prob_bad, n_bins=10)
    # Expected ECE is |0.05 - 0.95| = 0.90
    assert ece_bad == pytest.approx(0.90, abs=0.05)

    # 3. Empty input edge case
    assert compute_expected_calibration_error([], []) == 0.0


def test_brier_score_calculations_and_edge_cases():
    """Verify Brier score MSE calculation and safety on edge cases."""
    # 1. Standard cases
    y_true = np.array([1, 0, 1, 0])
    y_prob = np.array([0.9, 0.1, 0.8, 0.2])
    # MSE = ((0.1)^2 + (0.1)^2 + (0.2)^2 + (0.2)^2) / 4 = (0.01 + 0.01 + 0.04 + 0.04) / 4 = 0.10 / 4 = 0.025
    brier = compute_brier_score(y_true, y_prob)
    assert brier == pytest.approx(0.025, abs=1e-5)

    # 2. Perfect prediction: score = 0.0
    assert compute_brier_score([1, 0], [1.0, 0.0]) == 0.0

    # 3. Worst possible prediction: score = 1.0
    assert compute_brier_score([1, 0], [0.0, 1.0]) == 1.0

    # 4. Single-class array (all 0s or all 1s) must not crash
    y_single_zero = np.array([0, 0, 0, 0])
    p_single_zero = np.array([0.1, 0.2, 0.0, 0.1])
    brier_single = compute_brier_score(y_single_zero, p_single_zero)
    assert 0.0 <= brier_single <= 0.1

    # 5. Empty input
    assert compute_brier_score([], []) == 0.0


def test_pr_auc_and_roc_auc_calculations_and_edge_cases():
    """Verify PR-AUC and ROC-AUC calculations, including single-class edge cases."""
    # 1. Well-separated classes
    y_true = np.array([0, 0, 0, 1, 1, 1])
    y_prob = np.array([0.05, 0.1, 0.15, 0.85, 0.9, 0.95])

    roc = compute_roc_auc(y_true, y_prob)
    pr = compute_pr_auc(y_true, y_prob)
    assert roc == pytest.approx(1.0, abs=1e-4)
    assert pr == pytest.approx(1.0, abs=1e-4)

    # 2. Single-class arrays (undefined in standard ROC-AUC/PR-AUC formulas)
    # Must return 0.5 without throwing exceptions
    y_all_zero = np.zeros(10)
    p_all_zero = np.random.uniform(0.1, 0.4, 10)
    assert compute_roc_auc(y_all_zero, p_all_zero) == 0.5
    assert compute_pr_auc(y_all_zero, p_all_zero) == 0.5

    y_all_one = np.ones(10)
    p_all_one = np.random.uniform(0.6, 0.9, 10)
    assert compute_roc_auc(y_all_one, p_all_one) == 0.5
    assert compute_pr_auc(y_all_one, p_all_one) == 0.5

    # 3. Empty input arrays
    assert compute_roc_auc([], []) == 0.5
    assert compute_pr_auc([], []) == 0.0


# ---------------------------------------------------------------------------
# 2. Reliability Diagram Binning Tests
# ---------------------------------------------------------------------------

def test_reliability_diagram_bins_properties():
    """Verify reliability diagram binning returns 10 bins, sample counts sum to N, and monotonic bounds."""
    np.random.seed(42)
    n_samples = 250
    y_prob = np.random.uniform(0.0, 1.0, n_samples)
    y_true = (y_prob > 0.5).astype(int)

    bins = compute_reliability_diagram_bins(y_true, y_prob, n_bins=10)

    # 1. Exactly 10 bins returned
    assert len(bins) == 10

    # 2. Sample counts sum to total samples
    total_samples = sum(b["sample_count"] for b in bins)
    assert total_samples == n_samples, f"Expected {n_samples} samples, got {total_samples}"

    # 3. Monotonic bin bounds across [0.0, 1.0]
    for i, b in enumerate(bins):
        assert b["bin_idx"] == i
        assert b["min_prob"] < b["max_prob"]
        assert 0.0 <= b["min_prob"] <= 1.0
        assert 0.0 <= b["max_prob"] <= 1.0
        if i > 0:
            assert np.isclose(b["min_prob"], bins[i - 1]["max_prob"])

    # 4. For non-empty bins, mean_pred is within [min_prob, max_prob] and empirical_acc in [0, 1]
    for b in bins:
        if b["sample_count"] > 0:
            assert b["min_prob"] - 1e-4 <= b["mean_pred"] <= b["max_prob"] + 1e-4
            assert 0.0 <= b["empirical_acc"] <= 1.0

    # 5. Empty input handling
    empty_bins = compute_reliability_diagram_bins([], [], n_bins=10)
    assert len(empty_bins) == 10
    assert sum(b["sample_count"] for b in empty_bins) == 0


def test_evaluate_predictions_aggregation():
    """Verify evaluate_predictions returns aggregated metrics dictionary with reliability diagram."""
    y_true = np.array([0, 1, 0, 1, 1, 0, 1, 0])
    y_prob = np.array([0.1, 0.8, 0.2, 0.75, 0.9, 0.3, 0.85, 0.15])

    res = evaluate_predictions(y_true, y_prob, model_name="TestModel")
    assert res["model_name"] == "TestModel"
    assert "roc_auc" in res
    assert "pr_auc" in res
    assert "brier_score" in res
    assert "ece" in res
    assert res["sample_count"] == 8
    assert "reliability_bins" in res
    assert len(res["reliability_bins"]) == 10

    # Backwards-compatible evaluate_calibration_metrics
    compat = evaluate_calibration_metrics(y_true, y_prob)
    assert "roc_auc" in compat
    assert "ece" in compat


# ---------------------------------------------------------------------------
# 3. Validation Split Protocols (LOCO / LOSO) Tests
# ---------------------------------------------------------------------------

def test_leave_one_circuit_out_cv_zero_leakage():
    """
    Verify LOCO cross-validation generator ensures zero circuit leakage between
    train and test indices across multi-circuit datasets.
    """
    # 4 circuits, 50 samples each
    circuits = np.repeat([1, 2, 3, 4], 50)
    df = pd.DataFrame({
        "circuit_id": circuits,
        "feature_1": np.random.randn(200),
        "target_overtake": np.random.binomial(1, 0.3, 200),
    })

    splits = list(leave_one_circuit_out_cv(df, group_col="circuit_id"))
    assert len(splits) == 4, f"Expected 4 splits for 4 circuits, got {len(splits)}"

    visited_test_circuits = set()

    for train_idx, val_idx in splits:
        train_circuits = set(df.iloc[train_idx]["circuit_id"])
        val_circuits = set(df.iloc[val_idx]["circuit_id"])

        # Zero leakage: train and val circuits must be strictly disjoint
        assert train_circuits.isdisjoint(val_circuits), (
            f"Circuit leakage detected! Train: {train_circuits}, Val: {val_circuits}"
        )

        # Union covers all samples
        assert len(train_idx) + len(val_idx) == len(df)

        # In LOCO, each val fold holds out exactly one circuit
        assert len(val_circuits) == 1
        val_c = next(iter(val_circuits))
        assert val_c not in visited_test_circuits
        visited_test_circuits.add(val_c)

    assert visited_test_circuits == {1, 2, 3, 4}


def test_leave_one_circuit_out_cv_fallback_single_group():
    """
    Verify LOCO cross-validation generator gracefully falls back to Stratified K-Fold
    when the circuit count is < 2.
    """
    # Only 1 circuit
    df = pd.DataFrame({
        "circuit_id": np.ones(100, dtype=int),
        "feature_1": np.random.randn(100),
        "target_overtake": np.array([1] * 20 + [0] * 80),
    })

    splits = list(leave_one_circuit_out_cv(df, group_col="circuit_id"))
    # Fallback to Stratified K-Fold with 5 splits
    assert len(splits) == 5, f"Expected 5 stratified fallback folds, got {len(splits)}"

    for train_idx, val_idx in splits:
        assert len(train_idx) > 0
        assert len(val_idx) > 0
        assert set(train_idx).isdisjoint(set(val_idx))
        # Both classes should be represented in training
        assert len(np.unique(df.iloc[train_idx]["target_overtake"])) == 2


def test_leave_one_season_out_cv_zero_leakage():
    """Verify LOSO cross-validation generator ensures zero session leakage."""
    sessions = np.repeat(["2023_1_R", "2023_2_R", "2023_3_R"], 40)
    df = pd.DataFrame({
        "session_id": sessions,
        "feature_1": np.random.randn(120),
        "target_pit": np.random.binomial(1, 0.25, 120),
    })

    splits = list(leave_one_season_out_cv(df, season_col="session_id"))
    assert len(splits) == 3

    for train_idx, val_idx in splits:
        train_sessions = set(df.iloc[train_idx]["session_id"])
        val_sessions = set(df.iloc[val_idx]["session_id"])
        assert train_sessions.isdisjoint(val_sessions)


# ---------------------------------------------------------------------------
# 4. Domain Heuristic Baseline Tests
# ---------------------------------------------------------------------------

def test_heuristic_overtake_predict_bounds_and_physics():
    """
    Verify overtake domain heuristic:
    - Bounded in [0.0, 1.0].
    - Monotonically increases with closing speed and DRS activation.
    - Monotonically decreases with larger distance gap.
    """
    df = pd.DataFrame({
        "delta_s": [5.0, 20.0, 50.0, 100.0, -10.0],
        "delta_v": [25.0, 0.0, -10.0, -30.0, 40.0],
        "drs_active": [1, 0, 0, 0, 1],
    })

    probs = heuristic_overtake_predict(df)
    assert len(probs) == len(df)
    assert np.all(probs >= 0.0)
    assert np.all(probs <= 1.0)

    # Physics test: DRS active + close distance + high velocity must have highest probability
    p_attack = probs[0]
    p_trailing = probs[3]
    assert p_attack > p_trailing
    assert p_attack > 0.50
    assert p_trailing < 0.10


def test_heuristic_pit_predict_bounds_and_hazard():
    """
    Verify pit stop domain heuristic:
    - Bounded in [0.0, 1.0].
    - Increases with tyre stint progression.
    - Increases with Safety Car / VSC neutralization hazard bonus.
    """
    df = pd.DataFrame({
        "stint_progression_ratio": [0.2, 0.8, 1.3, 0.3, 1.2],
        "sc_active": [0, 0, 0, 1, 1],
        "vsc_active": [0, 0, 0, 0, 0],
    })

    probs = heuristic_pit_predict(df)
    assert len(probs) == len(df)
    assert np.all(probs >= 0.0)
    assert np.all(probs <= 1.0)

    # 1. Progression: High progression (row 2) > low progression (row 0)
    assert probs[2] > probs[0]

    # 2. Safety Car hazard: Fresh tyre under SC (row 3) > fresh tyre green flag (row 0)
    assert probs[3] > probs[0]

    # 3. Worn tyre under Safety Car (row 4) has highest hazard
    assert probs[4] > 0.80


# ---------------------------------------------------------------------------
# 5. Three-Tier Benchmarking Suite Tests
# ---------------------------------------------------------------------------

def test_benchmark_overtake_models_slice():
    """
    Verify benchmark_overtake_models executes cross-validation across all 3 tiers
    and returns comparative metrics and Markdown table.
    """
    rng = np.random.default_rng(42)
    n = 100

    # Synthetic slice with 2 circuits to exercise cross-validation
    df = pd.DataFrame({
        "circuit_id": rng.choice([1, 2], n),
        "delta_s": rng.uniform(2, 40, n),
        "delta_v": rng.uniform(-10, 30, n),
        "euclidean_dist": rng.uniform(2, 40, n),
        "drs_active": rng.choice([0, 1], n),
        "mean_throttle": rng.uniform(60, 100, n),
        "throttle_jerk": rng.uniform(-50, 50, n),
        "mean_brake": rng.uniform(0, 1, n),
        "brake_onset_delta": rng.uniform(-10, 10, n),
        "tyre_age_delta": rng.uniform(-10, 10, n),
        "compound_delta": rng.choice([-1.0, 0.0, 1.0], n),
        "clean_air_pace_diff": rng.uniform(-0.5, 0.5, n),
        "dist_to_next_heavy_braking": rng.uniform(50, 500, n),
        "straight_fraction_remaining": rng.uniform(0, 1, n),
        "curvature": rng.uniform(0.001, 0.01, n),
        "target_overtake": rng.binomial(1, 0.35, n),
    })

    report = benchmark_overtake_models(df, n_splits=2, random_state=42)
    assert isinstance(report, BenchmarkReport)

    # 1. Verify tuple unpacking
    metrics, table = report
    assert isinstance(metrics, dict)
    assert isinstance(table, str)
    assert "| Model Tier | ROC-AUC |" in table

    # 2. Verify all 3 tiers exist
    expected_tiers = [
        "Tier 1: Domain Heuristic Baseline",
        "Tier 2: Uncalibrated Booster Baseline",
        "Tier 3: Calibrated Monotone Physics Model",
    ]
    for tier in expected_tiers:
        assert tier in metrics
        tier_res = metrics[tier]
        assert "roc_auc" in tier_res
        assert "pr_auc" in tier_res
        assert "brier_score" in tier_res
        assert "ece" in tier_res

    # 3. Verify dictionary indexing & prefix matching
    assert report["Tier 1"]["roc_auc"] == metrics["Tier 1: Domain Heuristic Baseline"]["roc_auc"]
    assert report["Tier 2"]["brier_score"] == metrics["Tier 2: Uncalibrated Booster Baseline"]["brier_score"]
    assert report["Tier 3"]["ece"] == metrics["Tier 3: Calibrated Monotone Physics Model"]["ece"]


def test_benchmark_pit_models_slice():
    """
    Verify benchmark_pit_models executes cross-validation across all 3 tiers
    and returns comparative metrics and Markdown table.
    """
    rng = np.random.default_rng(42)
    n = 100

    df = pd.DataFrame({
        "circuit_id": rng.choice([1, 2], n),
        "tyre_life": rng.integers(1, 35, n),
        "tyre_compound": rng.choice([0.0, 1.0, 2.0], n),
        "stint_progression_ratio": rng.uniform(0.1, 1.5, n),
        "fuel_corrected_degradation_slope": rng.uniform(0.01, 0.08, n),
        "pit_loss_delta": rng.choice([0.0, 8.5, 12.0], n),
        "traffic_rejoin_gap": rng.uniform(1.0, 15.0, n),
        "sc_active": rng.choice([0, 1], n, p=[0.8, 0.2]),
        "vsc_active": rng.choice([0, 1], n, p=[0.85, 0.15]),
        "lap_number": rng.integers(5, 50, n),
        "target_pit": rng.binomial(1, 0.30, n),
    })

    report = benchmark_pit_models(df, n_splits=2, random_state=42)
    assert isinstance(report, BenchmarkReport)

    metrics, table = report
    assert isinstance(metrics, dict)
    assert isinstance(table, str)
    assert "| Model Tier | ROC-AUC |" in table

    for tier in [
        "Tier 1: Domain Heuristic Baseline",
        "Tier 2: Uncalibrated Booster Baseline",
        "Tier 3: Calibrated Monotone Physics Model",
    ]:
        assert tier in metrics
        assert 0.0 <= metrics[tier]["roc_auc"] <= 1.0
        assert 0.0 <= metrics[tier]["brier_score"] <= 1.0
        assert 0.0 <= metrics[tier]["ece"] <= 1.0


def test_format_benchmark_markdown_table():
    """Verify Markdown table generation conforms to GitHub table format."""
    dummy_metrics = {
        "Tier 1: Domain Heuristic Baseline": {"roc_auc": 0.75, "pr_auc": 0.60, "brier_score": 0.18, "ece": 0.10},
        "Tier 2: Uncalibrated Booster Baseline": {"roc_auc": 0.85, "pr_auc": 0.72, "brier_score": 0.14, "ece": 0.08},
    }

    table = format_benchmark_markdown_table(dummy_metrics, title="Test Benchmark")
    assert "### Test Benchmark" in table
    assert "| Model Tier | ROC-AUC | PR-AUC | Brier Score (lower is better) | ECE (lower is better) |" in table
    assert "| Tier 1: Domain Heuristic Baseline | 0.7500 | 0.6000 | 0.1800 | 0.1000 |" in table
    assert "| Tier 2: Uncalibrated Booster Baseline | 0.8500 | 0.7200 | 0.1400 | 0.0800 |" in table
