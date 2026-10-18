"""
Evaluation Protocol, Calibration Metrics, and Three-Tier Benchmarking Suite.
F1 Synapse Machine Learning & Predictive Analytics.

Provides:
1. Standard Calibration & Evaluation Metrics:
   - Expected Calibration Error (ECE)
   - Brier Score
   - PR-AUC (Average Precision)
   - ROC-AUC
   - Reliability Diagram Bins
   - Aggregated Prediction Evaluator
2. Validation Split Protocols:
   - Leave-One-Circuit-Out (LOCO) CV
   - Leave-One-Season-Out (LOSO) CV
   - Robust fallback to Stratified K-Fold / K-Fold when group count < 2
3. Three-Tier Benchmarking Suite:
   - Tier 1: Domain Heuristic Baseline (Physics Logistic & Stint Wear Hazard)
   - Tier 2: Uncalibrated Booster Baseline (LightGBM / XGBoost without constraints)
   - Tier 3: Calibrated Monotone Physics Model (LightGBM / XGBoost with monotonic physics + isotonic calibration)
"""

from __future__ import annotations
import math
from typing import Any, Dict, Generator, List, Optional, Tuple, Union
import numpy as np
import pandas as pd
from sklearn.metrics import roc_auc_score, average_precision_score, brier_score_loss
from sklearn.model_selection import GroupKFold, LeaveOneGroupOut, StratifiedKFold, KFold
from sklearn.calibration import CalibratedClassifierCV
try:
    from sklearn.frozen import FrozenEstimator
except ImportError:
    FrozenEstimator = None

import lightgbm as lgb
from xgboost import XGBClassifier

from src.ml.features import OVERTAKE_FEATURE_COLUMNS, PIT_FEATURE_COLUMNS
from src.ml.overtake import prepare_overtake_dataframe
from src.ml.pit import prepare_pit_dataframe


# ---------------------------------------------------------------------------
# 1. Calibration & Evaluation Metrics
# ---------------------------------------------------------------------------

def compute_expected_calibration_error(
    y_true: Union[np.ndarray, List[Any], pd.Series],
    y_prob: Union[np.ndarray, List[Any], pd.Series],
    n_bins: int = 10,
) -> float:
    """
    Computes Expected Calibration Error (ECE) across equidistant confidence bins in [0, 1].
    ECE = sum_{m=1}^M (|B_m| / N) * |acc(B_m) - conf(B_m)|
    """
    y_true_arr = np.asarray(y_true, dtype=float)
    y_prob_arr = np.asarray(y_prob, dtype=float)

    n = len(y_prob_arr)
    if n == 0 or len(y_true_arr) == 0:
        return 0.0

    y_prob_clipped = np.clip(y_prob_arr, 0.0, 1.0)
    bin_edges = np.linspace(0.0, 1.0, n_bins + 1)
    ece = 0.0

    for i in range(n_bins):
        low, high = bin_edges[i], bin_edges[i + 1]
        if i == n_bins - 1:
            mask = (y_prob_clipped >= low) & (y_prob_clipped <= high)
        else:
            mask = (y_prob_clipped >= low) & (y_prob_clipped < high)

        bin_size = int(np.sum(mask))
        if bin_size > 0:
            bin_acc = float(np.mean(y_true_arr[mask]))
            bin_conf = float(np.mean(y_prob_clipped[mask]))
            ece += (bin_size / n) * abs(bin_acc - bin_conf)

    return float(ece)


def compute_brier_score(
    y_true: Union[np.ndarray, List[Any], pd.Series],
    y_prob: Union[np.ndarray, List[Any], pd.Series],
) -> float:
    """
    Computes the Brier score (mean squared error of probability predictions).
    Lower is better. Perfect calibration and accuracy = 0.0.
    """
    y_true_arr = np.asarray(y_true, dtype=float)
    y_prob_arr = np.asarray(y_prob, dtype=float)

    if len(y_prob_arr) == 0 or len(y_true_arr) == 0:
        return 0.0

    y_prob_clipped = np.clip(y_prob_arr, 0.0, 1.0)
    return float(brier_score_loss(y_true_arr, y_prob_clipped))


def compute_pr_auc(
    y_true: Union[np.ndarray, List[Any], pd.Series],
    y_prob: Union[np.ndarray, List[Any], pd.Series],
) -> float:
    """
    Computes Area Under the Precision-Recall Curve (PR-AUC / Average Precision).
    Handles edge cases (single-class arrays, empty inputs) gracefully without throwing exceptions.
    """
    y_true_arr = np.asarray(y_true)
    y_prob_arr = np.asarray(y_prob, dtype=float)

    if len(y_true_arr) == 0 or len(y_prob_arr) == 0:
        return 0.0

    unique_classes = np.unique(y_true_arr)
    if len(unique_classes) < 2:
        # Undefined in single-class arrays; return baseline 0.5
        return 0.5

    try:
        y_prob_clipped = np.clip(y_prob_arr, 0.0, 1.0)
        return float(average_precision_score(y_true_arr, y_prob_clipped))
    except Exception:
        return 0.5


def compute_roc_auc(
    y_true: Union[np.ndarray, List[Any], pd.Series],
    y_prob: Union[np.ndarray, List[Any], pd.Series],
) -> float:
    """
    Computes Area Under the Receiver Operating Characteristic Curve (ROC-AUC).
    Handles single-class or uninformative edge cases gracefully by returning 0.5.
    """
    y_true_arr = np.asarray(y_true)
    y_prob_arr = np.asarray(y_prob, dtype=float)

    if len(y_true_arr) == 0 or len(y_prob_arr) == 0:
        return 0.5

    unique_classes = np.unique(y_true_arr)
    if len(unique_classes) < 2:
        return 0.5

    try:
        y_prob_clipped = np.clip(y_prob_arr, 0.0, 1.0)
        return float(roc_auc_score(y_true_arr, y_prob_clipped))
    except Exception:
        return 0.5


def compute_reliability_diagram_bins(
    y_true: Union[np.ndarray, List[Any], pd.Series],
    y_prob: Union[np.ndarray, List[Any], pd.Series],
    n_bins: int = 10,
) -> List[Dict[str, Any]]:
    """
    Computes reliability diagram bins for probability calibration assessment.
    Returns exactly n_bins dictionaries with keys:
    - bin_idx: int (0 to n_bins - 1)
    - min_prob: float (lower confidence bound)
    - max_prob: float (upper confidence bound)
    - sample_count: int (number of observations in bin)
    - mean_pred: float (average predicted probability in bin)
    - empirical_acc: float (fraction of positive true labels in bin)
    """
    y_true_arr = np.asarray(y_true, dtype=float)
    y_prob_arr = np.asarray(y_prob, dtype=float)

    n = len(y_prob_arr)
    y_prob_clipped = np.clip(y_prob_arr, 0.0, 1.0) if n > 0 else np.array([])
    bin_edges = np.linspace(0.0, 1.0, n_bins + 1)
    bins: List[Dict[str, Any]] = []

    for i in range(n_bins):
        low, high = float(bin_edges[i]), float(bin_edges[i + 1])
        if n == 0:
            bins.append({
                "bin_idx": i,
                "min_prob": round(low, 4),
                "max_prob": round(high, 4),
                "sample_count": 0,
                "mean_pred": round((low + high) / 2.0, 4),
                "empirical_acc": 0.0,
            })
            continue

        if i == n_bins - 1:
            mask = (y_prob_clipped >= low) & (y_prob_clipped <= high)
        else:
            mask = (y_prob_clipped >= low) & (y_prob_clipped < high)

        bin_size = int(np.sum(mask))
        if bin_size > 0:
            mean_pred = float(np.mean(y_prob_clipped[mask]))
            empirical_acc = float(np.mean(y_true_arr[mask]))
        else:
            mean_pred = float((low + high) / 2.0)
            empirical_acc = 0.0

        bins.append({
            "bin_idx": i,
            "min_prob": round(low, 4),
            "max_prob": round(high, 4),
            "sample_count": bin_size,
            "mean_pred": round(mean_pred, 4),
            "empirical_acc": round(empirical_acc, 4),
        })

    return bins


def evaluate_predictions(
    y_true: Union[np.ndarray, List[Any], pd.Series],
    y_prob: Union[np.ndarray, List[Any], pd.Series],
    model_name: str = "",
) -> Dict[str, Any]:
    """
    Aggregates ROC-AUC, PR-AUC, Brier Score, Expected Calibration Error (ECE),
    and reliability diagram bins into a structured evaluation dictionary.
    """
    y_true_arr = np.asarray(y_true, dtype=float)
    y_prob_arr = np.asarray(y_prob, dtype=float)

    roc_auc = compute_roc_auc(y_true_arr, y_prob_arr)
    pr_auc = compute_pr_auc(y_true_arr, y_prob_arr)
    brier = compute_brier_score(y_true_arr, y_prob_arr)
    ece = compute_expected_calibration_error(y_true_arr, y_prob_arr)
    reliability_bins = compute_reliability_diagram_bins(y_true_arr, y_prob_arr)

    return {
        "model_name": model_name,
        "roc_auc": round(float(roc_auc), 4),
        "pr_auc": round(float(pr_auc), 4),
        "brier_score": round(float(brier), 4),
        "ece": round(float(ece), 4),
        "sample_count": len(y_prob_arr),
        "reliability_bins": reliability_bins,
    }


def evaluate_calibration_metrics(
    y_true: Union[np.ndarray, List[Any], pd.Series],
    y_prob: Union[np.ndarray, List[Any], pd.Series],
) -> Dict[str, float]:
    """
    Backward-compatible summary metrics dictionary containing scalar scores:
    roc_auc, pr_auc, brier_score, ece.
    """
    full = evaluate_predictions(y_true, y_prob)
    return {
        "roc_auc": full["roc_auc"],
        "pr_auc": full["pr_auc"],
        "brier_score": full["brier_score"],
        "ece": full["ece"],
    }


def compute_balanced_focal_weights(
    y: Union[np.ndarray, List[Any], pd.Series],
    gamma: float = 2.0,
    alpha: float = 0.25,
) -> np.ndarray:
    """
    Computes balanced focal weights for rare event classification (gamma=2.0, alpha=0.25)
    to prevent probability collapse on rare passes/events. Mean weight is normalized to 1.0.
    """
    y_arr = np.asarray(y, dtype=int)
    n = len(y_arr)
    if n == 0:
        return np.array([], dtype=float)

    n_pos = int(np.sum(y_arr == 1))
    n_neg = int(np.sum(y_arr == 0))
    if n_pos == 0 or n_neg == 0:
        return np.ones(n, dtype=float)

    p_base = float(n_pos / n)
    w = np.where(
        y_arr == 1,
        (alpha * (n / (2.0 * n_pos))) * ((1.0 - p_base) ** gamma),
        ((1.0 - alpha) * (n / (2.0 * n_neg))) * (p_base ** gamma),
    )
    mean_w = np.mean(w)
    if mean_w > 0:
        w = w / mean_w
    return w


def wrap_calibrated_classifier(
    base_model: Any,
    method: str = "isotonic",
    cv: Optional[Any] = None,
) -> CalibratedClassifierCV:
    """
    Wraps prefit model with CalibratedClassifierCV supporting both sklearn <1.4 (cv='prefit')
    and sklearn >=1.4 (FrozenEstimator).
    """
    if FrozenEstimator is not None:
        kwargs: Dict[str, Any] = {"estimator": FrozenEstimator(base_model), "method": method}
        if cv is not None:
            kwargs["cv"] = cv
        return CalibratedClassifierCV(**kwargs)
    else:
        return CalibratedClassifierCV(estimator=base_model, method=method, cv=cv if cv is not None else "prefit")



# ---------------------------------------------------------------------------
# 2. Validation Split Protocols
# ---------------------------------------------------------------------------

def _extract_target_series(df: pd.DataFrame) -> Optional[pd.Series]:
    """Helper to locate common target columns for stratification."""
    for col in ["target_overtake", "target_pit", "target"]:
        if col in df.columns:
            return df[col]
    return None


def leave_one_circuit_out_cv(
    df: pd.DataFrame,
    group_col: str = "circuit_id",
    n_splits: Optional[int] = None,
) -> Generator[Tuple[np.ndarray, np.ndarray], None, None]:
    """
    Leave-One-Circuit-Out (LOCO) Cross-Validation generator.
    Guarantees zero circuit leakage between training and validation indices.
    Falls back to Stratified K-Fold (or standard K-Fold) when group count < 2.
    """
    n_samples = len(df)
    if n_samples == 0:
        return

    # Check if group column is present with at least 2 distinct groups
    if group_col in df.columns:
        unique_groups = df[group_col].nunique()
        if unique_groups >= 2:
            if n_splits is not None and n_splits < unique_groups:
                cv = GroupKFold(n_splits=n_splits)
                yield from cv.split(df, groups=df[group_col])
                return
            else:
                logo = LeaveOneGroupOut()
                yield from logo.split(df, groups=df[group_col])
                return

    # Fallback to Stratified K-Fold / K-Fold
    y = _extract_target_series(df)
    if y is not None and y.nunique() >= 2:
        min_class_count = int(y.value_counts().min())
        if min_class_count >= 2:
            k = min(5, max(2, n_samples // 20)) if n_samples >= 40 else min(5, max(2, n_samples))
            if n_splits is not None:
                k = min(n_splits, n_samples)
            k = min(k, min_class_count)
            skf = StratifiedKFold(n_splits=k, shuffle=True, random_state=42)
            yield from skf.split(df, y)
            return

    k = min(5, max(2, n_samples))
    if n_splits is not None:
        k = min(n_splits, n_samples)
    kf = KFold(n_splits=k, shuffle=True, random_state=42)
    yield from kf.split(df)


def leave_one_season_out_cv(
    df: pd.DataFrame,
    season_col: str = "session_id",
    n_splits: Optional[int] = None,
) -> Generator[Tuple[np.ndarray, np.ndarray], None, None]:
    """
    Leave-One-Season-Out (LOSO) Cross-Validation generator.
    Partitions datasets by season/session identifier to prevent temporal leakage.
    Falls back to Stratified K-Fold (or standard K-Fold) when group count < 2.
    """
    n_samples = len(df)
    if n_samples == 0:
        return

    if season_col in df.columns:
        unique_groups = df[season_col].nunique()
        if unique_groups >= 2:
            if n_splits is not None and n_splits < unique_groups:
                cv = GroupKFold(n_splits=n_splits)
                yield from cv.split(df, groups=df[season_col])
                return
            else:
                logo = LeaveOneGroupOut()
                yield from logo.split(df, groups=df[season_col])
                return

    # Fallback to Stratified K-Fold / K-Fold
    y = _extract_target_series(df)
    if y is not None and y.nunique() >= 2:
        min_class_count = int(y.value_counts().min())
        if min_class_count >= 2:
            k = min(5, max(2, n_samples // 20)) if n_samples >= 40 else min(5, max(2, n_samples))
            if n_splits is not None:
                k = min(n_splits, n_samples)
            k = min(k, min_class_count)
            skf = StratifiedKFold(n_splits=k, shuffle=True, random_state=42)
            yield from skf.split(df, y)
            return

    k = min(5, max(2, n_samples))
    if n_splits is not None:
        k = min(n_splits, n_samples)
    kf = KFold(n_splits=k, shuffle=True, random_state=42)
    yield from kf.split(df)


# ---------------------------------------------------------------------------
# 3. Domain Heuristics (Tier 1)
# ---------------------------------------------------------------------------

def heuristic_overtake_predict(df: pd.DataFrame) -> np.ndarray:
    """
    Tier 1 Domain Heuristic Baseline for Overtake Probability.
    Physics logistic formula:
    P = sigma(0.12 * delta_v - 0.08 * delta_s + 0.8 * drs - 1.5)
    Outputs are clipped strictly to [0.001, 0.999].
    """
    if df.empty:
        return np.array([], dtype=float)

    delta_s = df["delta_s"].to_numpy(dtype=float) if "delta_s" in df.columns else np.full(len(df), 20.0)
    delta_v = df["delta_v"].to_numpy(dtype=float) if "delta_v" in df.columns else np.full(len(df), 0.0)
    if "drs_active" in df.columns:
        drs = df["drs_active"].to_numpy(dtype=float)
    elif "drs" in df.columns:
        drs = df["drs"].to_numpy(dtype=float)
    else:
        drs = np.zeros(len(df), dtype=float)

    z = 0.12 * delta_v - 0.08 * delta_s + 0.8 * drs - 1.5
    z_clipped = np.clip(z, -50.0, 50.0)
    p = 1.0 / (1.0 + np.exp(-z_clipped))
    return np.clip(p, 0.001, 0.999)


def heuristic_pit_predict(df: pd.DataFrame) -> np.ndarray:
    """
    Tier 1 Domain Heuristic Baseline for Pit Stop Likelihood.
    Stint wear & SC hazard formula:
    P = clip((stint_progression ** 2.5) * 0.5 + 0.4 * sc + 0.2 * vsc, 0.01, 0.99)
    """
    if df.empty:
        return np.array([], dtype=float)

    if "stint_progression_ratio" in df.columns:
        prog = df["stint_progression_ratio"].to_numpy(dtype=float)
    elif "tyre_life" in df.columns:
        prog = df["tyre_life"].to_numpy(dtype=float) / 28.0
    else:
        prog = np.full(len(df), 0.5, dtype=float)

    prog_safe = np.clip(np.maximum(0.0, prog), 0.0, 2.5)
    sc = df["sc_active"].to_numpy(dtype=float) if "sc_active" in df.columns else np.zeros(len(df))
    vsc = df["vsc_active"].to_numpy(dtype=float) if "vsc_active" in df.columns else np.zeros(len(df))

    p = (prog_safe ** 2.5) * 0.5 + 0.4 * sc + 0.2 * vsc
    return np.clip(p, 0.01, 0.99)


# ---------------------------------------------------------------------------
# 4. Benchmarking Report Container & Markdown Formatter
# ---------------------------------------------------------------------------

class BenchmarkReport:
    """
    Container for three-tier model evaluation benchmark results.
    Supports:
    - Tuple unpacking: `metrics, table = benchmark_overtake_models(...)`
    - Attribute access: `report.metrics`, `report.markdown_table`
    - Dictionary indexing: `report["Tier 1: Domain Heuristic Baseline"]` or `report["Tier 1"]`
    """
    def __init__(self, metrics: Dict[str, Dict[str, Any]], markdown_table: str):
        self.metrics = metrics
        self.markdown_table = markdown_table

    def __iter__(self):
        yield self.metrics
        yield self.markdown_table

    def __getitem__(self, item: Union[int, str]) -> Any:
        if isinstance(item, int):
            return (self.metrics, self.markdown_table)[item]
        if item in self.metrics:
            return self.metrics[item]
        if item == "metrics":
            return self.metrics
        if item in ("table", "markdown_table"):
            return self.markdown_table
        # Support prefix matching (e.g. 'Tier 1')
        for k in self.metrics:
            if k.startswith(item):
                return self.metrics[k]
        raise KeyError(item)

    def get(self, key: str, default: Any = None) -> Any:
        try:
            return self[key]
        except KeyError:
            return default

    def __repr__(self) -> str:
        return f"BenchmarkReport(tiers={list(self.metrics.keys())})\n\n{self.markdown_table}"


def format_benchmark_markdown_table(metrics: Dict[str, Dict[str, Any]], title: str = "") -> str:
    """
    Formats comparative evaluation metrics into a clean, GitHub-flavored Markdown table.
    Columns: Model Tier | ROC-AUC | PR-AUC | Brier Score (lower is better) | ECE (lower is better)
    """
    lines = []
    if title:
        lines.append(f"### {title}\n")
    lines.append("| Model Tier | ROC-AUC | PR-AUC | Brier Score (lower is better) | ECE (lower is better) |")
    lines.append("| :--- | :--- | :--- | :--- | :--- |")
    for tier_name, tier_metrics in metrics.items():
        roc = f"{tier_metrics.get('roc_auc', 0.0):.4f}"
        pr = f"{tier_metrics.get('pr_auc', 0.0):.4f}"
        brier = f"{tier_metrics.get('brier_score', 0.0):.4f}"
        ece = f"{tier_metrics.get('ece', 0.0):.4f}"
        lines.append(f"| {tier_name} | {roc} | {pr} | {brier} | {ece} |")
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# 5. Three-Tier Cross-Validation Benchmarking Functions
# ---------------------------------------------------------------------------

def benchmark_overtake_models(
    df: pd.DataFrame,
    group_col: str = "circuit_id",
    cv_splits: Optional[List[Tuple[np.ndarray, np.ndarray]]] = None,
    n_splits: Optional[int] = 5,
    random_state: int = 42,
) -> BenchmarkReport:
    """
    Runs Leave-One-Circuit-Out (LOCO) Cross-Validation benchmark across 3 tiers:
    - Tier 1: Domain Heuristic Baseline (Physics Logistic Formula)
    - Tier 2: Uncalibrated Booster Baseline (Standard LightGBM without constraints)
    - Tier 3: Calibrated Monotone Physics Model (LightGBM with monotone constraints + focal weights + isotonic calibration)

    Returns BenchmarkReport containing comparative metrics and a formatted Markdown table.
    """
    target_col = "target_overtake" if "target_overtake" in df.columns else "target"
    if target_col not in df.columns:
        raise ValueError(f"Overtake dataset missing target column '{target_col}'")

    X_prepared = prepare_overtake_dataframe(df)
    y = df[target_col].to_numpy(dtype=int)

    if cv_splits is None:
        cv_splits = list(leave_one_circuit_out_cv(df, group_col=group_col, n_splits=n_splits))

    if not cv_splits:
        raise ValueError("Cross-validation split generation yielded zero splits")

    oof_t1: List[float] = []
    oof_t2: List[float] = []
    oof_t3: List[float] = []
    oof_y: List[int] = []

    # Monotonic constraints matching domain physics:
    # delta_s: -1, delta_v: +1, euclidean_dist: -1, drs_active: +1, tyre_age_delta: -1, compound_delta: +1, clean_air_pace_diff: -1, dist_to_next_heavy_braking: -1
    monotone_constraints = [-1, 1, -1, 1, 0, 0, 0, 0, -1, 1, -1, -1, 0, 0]

    for train_idx, val_idx in cv_splits:
        X_train, y_train = X_prepared.iloc[train_idx], y[train_idx]
        X_val, y_val = X_prepared.iloc[val_idx], y[val_idx]
        df_val = df.iloc[val_idx]

        oof_y.extend(y_val.tolist())

        # ---------------- Tier 1: Domain Heuristic ----------------
        p_t1 = heuristic_overtake_predict(df_val)
        oof_t1.extend(p_t1.tolist())

        # ---------------- Tier 2: Uncalibrated Booster ----------------
        model_t2 = lgb.LGBMClassifier(
            n_estimators=100,
            learning_rate=0.05,
            max_depth=5,
            subsample=0.85,
            colsample_bytree=0.85,
            random_state=random_state,
            n_jobs=-1,
            verbose=-1,
        )
        model_t2.fit(X_train[OVERTAKE_FEATURE_COLUMNS], y_train)
        p_t2 = model_t2.predict_proba(X_val[OVERTAKE_FEATURE_COLUMNS])[:, 1]
        oof_t2.extend(p_t2.tolist())

        # ---------------- Tier 3: Calibrated Monotone Physics ----------------
        n_pos = int(np.sum(y_train == 1))
        n_neg = int(np.sum(y_train == 0))
        min_class = min(n_pos, n_neg)

        if min_class >= 2:
            inner_splits = min(4, min_class)
            inner_cv = StratifiedKFold(n_splits=inner_splits, shuffle=True, random_state=random_state)
            tr_sub_idx, cal_sub_idx = next(inner_cv.split(X_train, y_train))
            X_tr, y_tr = X_train.iloc[tr_sub_idx], y_train[tr_sub_idx]
            X_cal, y_cal = X_train.iloc[cal_sub_idx], y_train[cal_sub_idx]
        else:
            X_tr, y_tr = X_train, y_train
            X_cal, y_cal = X_train, y_train

        focal_w = compute_balanced_focal_weights(y_tr)
        model_t3_base = lgb.LGBMClassifier(
            n_estimators=100,
            learning_rate=0.05,
            max_depth=5,
            subsample=0.85,
            colsample_bytree=0.85,
            monotone_constraints=monotone_constraints,
            random_state=random_state,
            n_jobs=-1,
            verbose=-1,
        )
        model_t3_base.fit(X_tr[OVERTAKE_FEATURE_COLUMNS], y_tr, sample_weight=focal_w)
        min_cal_class = min(int(np.sum(y_cal == 1)), int(np.sum(y_cal == 0)))
        cal_cv = min(5, min_cal_class) if min_cal_class >= 2 else None
        cal_t3 = wrap_calibrated_classifier(model_t3_base, method="isotonic", cv=cal_cv)
        cal_t3.fit(X_cal[OVERTAKE_FEATURE_COLUMNS], y_cal)
        p_t3 = cal_t3.predict_proba(X_val[OVERTAKE_FEATURE_COLUMNS])[:, 1]
        oof_t3.extend(p_t3.tolist())

    y_all = np.array(oof_y)
    metrics: Dict[str, Dict[str, Any]] = {
        "Tier 1: Domain Heuristic Baseline": evaluate_predictions(y_all, np.array(oof_t1), "Tier 1: Domain Heuristic Baseline"),
        "Tier 2: Uncalibrated Booster Baseline": evaluate_predictions(y_all, np.array(oof_t2), "Tier 2: Uncalibrated Booster Baseline"),
        "Tier 3: Calibrated Monotone Physics Model": evaluate_predictions(y_all, np.array(oof_t3), "Tier 3: Calibrated Monotone Physics Model"),
    }

    markdown_table = format_benchmark_markdown_table(metrics, title="Overtake Probability Model Cross-Validation Benchmark")
    return BenchmarkReport(metrics=metrics, markdown_table=markdown_table)


def benchmark_pit_models(
    df: pd.DataFrame,
    group_col: str = "circuit_id",
    cv_splits: Optional[List[Tuple[np.ndarray, np.ndarray]]] = None,
    n_splits: Optional[int] = 5,
    random_state: int = 42,
) -> BenchmarkReport:
    """
    Runs Leave-One-Circuit-Out (LOCO) Cross-Validation benchmark across 3 tiers:
    - Tier 1: Domain Heuristic Baseline (Stint Wear & SC Hazard Formula)
    - Tier 2: Uncalibrated Booster Baseline (Standard XGBoost without constraints)
    - Tier 3: Calibrated Monotone Physics Model (XGBoost with monotonic strategy constraints + isotonic calibration)

    Returns BenchmarkReport containing comparative metrics and a formatted Markdown table.
    """
    target_col = "target_pit" if "target_pit" in df.columns else "target"
    if target_col not in df.columns:
        raise ValueError(f"Pit stop dataset missing target column '{target_col}'")

    X_prepared = prepare_pit_dataframe(df)
    y = df[target_col].to_numpy(dtype=int)

    if cv_splits is None:
        cv_splits = list(leave_one_circuit_out_cv(df, group_col=group_col, n_splits=n_splits))

    if not cv_splits:
        raise ValueError("Cross-validation split generation yielded zero splits")

    oof_t1: List[float] = []
    oof_t2: List[float] = []
    oof_t3: List[float] = []
    oof_y: List[int] = []

    # Monotonic constraints:
    # tyre_life >= 0, stint_progression_ratio >= 0, sc_active >= 0, vsc_active >= 0
    monotone_constraints = {
        "tyre_life": 1,
        "stint_progression_ratio": 1,
        "sc_active": 1,
        "vsc_active": 1,
    }

    for train_idx, val_idx in cv_splits:
        X_train, y_train = X_prepared.iloc[train_idx], y[train_idx]
        X_val, y_val = X_prepared.iloc[val_idx], y[val_idx]
        df_val = df.iloc[val_idx]

        oof_y.extend(y_val.tolist())

        # ---------------- Tier 1: Domain Heuristic ----------------
        p_t1 = heuristic_pit_predict(df_val)
        oof_t1.extend(p_t1.tolist())

        # ---------------- Tier 2: Uncalibrated Booster ----------------
        model_t2 = XGBClassifier(
            n_estimators=100,
            learning_rate=0.05,
            max_depth=5,
            subsample=0.8,
            colsample_bytree=0.8,
            eval_metric="logloss",
            random_state=random_state,
            n_jobs=-1,
        )
        model_t2.fit(X_train[PIT_FEATURE_COLUMNS], y_train)
        p_t2 = model_t2.predict_proba(X_val[PIT_FEATURE_COLUMNS])[:, 1]
        oof_t2.extend(p_t2.tolist())

        # ---------------- Tier 3: Calibrated Monotone Physics ----------------
        n_pos = int(np.sum(y_train == 1))
        n_neg = int(np.sum(y_train == 0))
        min_class = min(n_pos, n_neg)

        if min_class >= 2:
            inner_splits = min(4, min_class)
            inner_cv = StratifiedKFold(n_splits=inner_splits, shuffle=True, random_state=random_state)
            tr_sub_idx, cal_sub_idx = next(inner_cv.split(X_train, y_train))
            X_tr, y_tr = X_train.iloc[tr_sub_idx], y_train[tr_sub_idx]
            X_cal, y_cal = X_train.iloc[cal_sub_idx], y_train[cal_sub_idx]
        else:
            X_tr, y_tr = X_train, y_train
            X_cal, y_cal = X_train, y_train

        model_t3_base = XGBClassifier(
            n_estimators=100,
            learning_rate=0.05,
            max_depth=5,
            subsample=0.8,
            colsample_bytree=0.8,
            monotone_constraints=monotone_constraints,
            eval_metric="logloss",
            random_state=random_state,
            n_jobs=-1,
        )
        model_t3_base.fit(X_tr[PIT_FEATURE_COLUMNS], y_tr)
        min_cal_class = min(int(np.sum(y_cal == 1)), int(np.sum(y_cal == 0)))
        cal_cv = min(5, min_cal_class) if min_cal_class >= 2 else None
        cal_t3 = wrap_calibrated_classifier(model_t3_base, method="isotonic", cv=cal_cv)
        cal_t3.fit(X_cal[PIT_FEATURE_COLUMNS], y_cal)
        p_t3 = cal_t3.predict_proba(X_val[PIT_FEATURE_COLUMNS])[:, 1]
        oof_t3.extend(p_t3.tolist())

    y_all = np.array(oof_y)
    metrics: Dict[str, Dict[str, Any]] = {
        "Tier 1: Domain Heuristic Baseline": evaluate_predictions(y_all, np.array(oof_t1), "Tier 1: Domain Heuristic Baseline"),
        "Tier 2: Uncalibrated Booster Baseline": evaluate_predictions(y_all, np.array(oof_t2), "Tier 2: Uncalibrated Booster Baseline"),
        "Tier 3: Calibrated Monotone Physics Model": evaluate_predictions(y_all, np.array(oof_t3), "Tier 3: Calibrated Monotone Physics Model"),
    }

    markdown_table = format_benchmark_markdown_table(metrics, title="Pit Stop Window Anticipation Cross-Validation Benchmark")
    return BenchmarkReport(metrics=metrics, markdown_table=markdown_table)
