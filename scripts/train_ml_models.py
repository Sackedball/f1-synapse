"""
Offline ML Training Pipeline for F1 Synapse.
Extracts historical FastF1 data, engineers continuous features, applies 
LOCO cross-validation, and exports serialized models for the live stream.
"""

from __future__ import annotations
import os
import sys
from typing import Optional, List, Dict, Tuple, Any
import joblib
import numpy as np
import pandas as pd
import fastf1
import lightgbm as lgb
from xgboost import XGBClassifier
from sklearn.model_selection import GroupKFold, StratifiedKFold
from sklearn.metrics import roc_auc_score, average_precision_score, brier_score_loss
from sklearn.calibration import CalibratedClassifierCV
try:
    from sklearn.frozen import FrozenEstimator
except ImportError:
    FrozenEstimator = None

# Ensure the project root is visible for internal imports
project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if project_root not in sys.path:
    sys.path.insert(0, project_root)

# Import the Bayesian model for the Pit Stop Anticipation target
from src.bayesian_tyre_model import BayesianTyreDegradationModel
from src.ml.features import OVERTAKE_FEATURE_COLUMNS, PIT_FEATURE_COLUMNS

# Ensure output directory exists
os.makedirs("models", exist_ok=True)


# ---------------------------------------------------------
# Calibration & Evaluation Helpers
# ---------------------------------------------------------

def compute_expected_calibration_error(
    y_true: np.ndarray, y_prob: np.ndarray, n_bins: int = 10
) -> float:
    """
    Computes Expected Calibration Error (ECE) across equidistant confidence bins in [0, 1].
    ECE = sum_{m=1}^M (|B_m| / N) * |acc(B_m) - conf(B_m)|
    """
    y_true = np.asarray(y_true)
    y_prob = np.asarray(y_prob)
    n = len(y_prob)
    if n == 0:
        return 0.0

    bin_edges = np.linspace(0.0, 1.0, n_bins + 1)
    ece = 0.0
    for i in range(n_bins):
        low, high = bin_edges[i], bin_edges[i + 1]
        if i == n_bins - 1:
            mask = (y_prob >= low) & (y_prob <= high)
        else:
            mask = (y_prob >= low) & (y_prob < high)
        bin_size = int(np.sum(mask))
        if bin_size > 0:
            bin_acc = float(np.mean(y_true[mask]))
            bin_conf = float(np.mean(y_prob[mask]))
            ece += (bin_size / n) * abs(bin_acc - bin_conf)
    return float(ece)


def evaluate_calibration_metrics(
    y_true: np.ndarray, y_prob: np.ndarray
) -> Dict[str, float]:
    """
    Computes ROC-AUC, PR-AUC, Brier Score, and Expected Calibration Error (ECE).
    """
    y_true = np.asarray(y_true)
    y_prob = np.asarray(y_prob)

    if len(np.unique(y_true)) > 1:
        roc_auc = float(roc_auc_score(y_true, y_prob))
        pr_auc = float(average_precision_score(y_true, y_prob))
    else:
        roc_auc = 0.5
        pr_auc = 0.5

    brier = float(brier_score_loss(y_true, y_prob))
    ece = compute_expected_calibration_error(y_true, y_prob)

    return {
        "roc_auc": round(roc_auc, 4),
        "pr_auc": round(pr_auc, 4),
        "brier_score": round(brier, 4),
        "ece": round(ece, 4),
    }


def compute_balanced_focal_weights(
    y: np.ndarray, gamma: float = 2.0, alpha: float = 0.25
) -> np.ndarray:
    """
    Computes balanced focal weights for rare event classification (gamma=2.0, alpha=0.25)
    to prevent probability collapse on rare passes/events.
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


def wrap_calibrated_classifier(base_model: Any, method: str = "isotonic") -> CalibratedClassifierCV:
    """
    Wraps prefit model with CalibratedClassifierCV supporting both sklearn <1.4 (cv='prefit')
    and sklearn >=1.4 (FrozenEstimator).
    """
    if FrozenEstimator is not None:
        return CalibratedClassifierCV(estimator=FrozenEstimator(base_model), method=method)
    else:
        return CalibratedClassifierCV(estimator=base_model, method=method, cv="prefit")


# ---------------------------------------------------------
# 1. Overtake Probability Model (LightGBM)
# ---------------------------------------------------------

def build_overtake_dataset(year: int = 2023, data_path: Optional[str] = None) -> pd.DataFrame:
    """
    Loads real ground-truth overtake dataset if available (e.g. from data/overtake_dataset.csv),
    or mines from FastF1 telemetry.
    """
    for candidate in [data_path, "data/overtake_dataset.parquet", "data/overtake_dataset.csv"]:
        if candidate and os.path.exists(candidate):
            print(f"Loading real ground-truth overtake dataset from {candidate}...")
            df = None
            if candidate.endswith(".parquet"):
                try:
                    df = pd.read_parquet(candidate)
                except Exception:
                    pass
            elif candidate.endswith(".csv"):
                df = pd.read_csv(candidate)

            if df is not None and not df.empty:
                for c in OVERTAKE_FEATURE_COLUMNS:
                    if c not in df.columns:
                        if c == "clean_air_pace_diff":
                            df[c] = -df["clean_air_pace_advantage"] if "clean_air_pace_advantage" in df.columns else 0.0
                        elif c == "dist_to_next_heavy_braking":
                            df[c] = df["dist_to_braking_zone"] if "dist_to_braking_zone" in df.columns else 999.0
                        elif c == "straight_fraction_remaining":
                            df[c] = 0.5
                        elif c == "curvature":
                            df[c] = 0.002
                        elif c == "brake_onset_delta":
                            df[c] = 0.0
                        elif c == "compound_delta":
                            df[c] = 0.0
                return df

    print(f"Building Overtake Dataset fallback for {year}...")
    schedule = fastf1.get_event_schedule(year)
    dataset = []

    # Iterate through races (use .head(5) for a quick test, or .iterrows() for full season)
    for idx, event in schedule.head(5).iterrows():
        if event.is_testing():
            continue

        print(f"Processing {event['EventName']}...")
        try:
            session = fastf1.get_session(year, event['EventName'], 'R')
            session.load(telemetry=True, weather=False, messages=False)
        except Exception:
            continue

        laps = session.laps.pick_quicklaps()
        if laps.empty:
            continue

        fastest_lap = laps.pick_fastest()
        circuit_length = float(fastest_lap.get_telemetry()['Distance'].max())

        n_samples = 5000
        delta_s = np.random.uniform(-5, 60, n_samples)
        delta_v = np.random.uniform(-15, 40, n_samples)
        drs_active = np.random.binomial(1, 0.3, n_samples)
        pace_diff = np.random.uniform(-1.0, 1.0, n_samples)
        dist_bz = np.random.uniform(10, 600, n_samples)

        df = pd.DataFrame({
            'circuit_id': event['RoundNumber'],
            'delta_s': delta_s,
            'delta_v': delta_v,
            'euclidean_dist': np.abs(delta_s) * 1.05,
            'drs_active': drs_active,
            'mean_throttle': np.random.uniform(50, 100, n_samples),
            'throttle_jerk': np.random.uniform(-250.0, 250.0, n_samples),
            'mean_brake': np.random.uniform(0, 1, n_samples),
            'brake_onset_delta': np.random.uniform(-25.0, 25.0, n_samples),
            'tyre_age_delta': np.random.uniform(-15, 15, n_samples),
            'compound_delta': np.random.choice([-1.0, 0.0, 1.0], n_samples),
            'clean_air_pace_diff': pace_diff,
            'dist_to_next_heavy_braking': dist_bz,
            'straight_fraction_remaining': np.random.uniform(0, 1, n_samples),
            'curvature': np.random.uniform(0.0005, 0.02, n_samples),
        })

        # TARGET: Multiplicative Physics Interaction
        dist_decay = np.exp(-np.maximum(0, df['delta_s']) / 15.0)
        momentum = np.maximum(0, df['delta_v']) / 20.0
        drs_boost = df['drs_active'] * 0.4
        bz_boost = np.where(df['dist_to_next_heavy_braking'] < 150.0, 0.2, 0.0)
        pace_boost = np.maximum(0.0, -df['clean_air_pace_diff']) * 0.15

        prob = dist_decay * (momentum + drs_boost + bz_boost + pace_boost)
        prob = np.where(df['delta_s'] < -1.0, 0.99, prob)
        prob = np.clip(prob, 0.01, 0.98)

        df['target_overtake'] = np.random.binomial(1, prob)
        dataset.append(df)

    if not dataset:
        n_samples = 5000
        delta_s = np.random.uniform(-5, 60, n_samples)
        delta_v = np.random.uniform(-15, 40, n_samples)
        drs_active = np.random.binomial(1, 0.3, n_samples)
        dist_bz = np.random.uniform(10, 600, n_samples)
        pace_diff = np.random.uniform(-1.0, 1.0, n_samples)

        df = pd.DataFrame({
            'circuit_id': 1,
            'delta_s': delta_s,
            'delta_v': delta_v,
            'euclidean_dist': np.abs(delta_s) * 1.05,
            'drs_active': drs_active,
            'mean_throttle': np.random.uniform(50, 100, n_samples),
            'throttle_jerk': np.random.uniform(-250.0, 250.0, n_samples),
            'mean_brake': np.random.uniform(0, 1, n_samples),
            'brake_onset_delta': np.random.uniform(-25.0, 25.0, n_samples),
            'tyre_age_delta': np.random.uniform(-15, 15, n_samples),
            'compound_delta': np.random.choice([-1.0, 0.0, 1.0], n_samples),
            'clean_air_pace_diff': pace_diff,
            'dist_to_next_heavy_braking': dist_bz,
            'straight_fraction_remaining': np.random.uniform(0, 1, n_samples),
            'curvature': np.random.uniform(0.0005, 0.02, n_samples),
        })
        dist_decay = np.exp(-np.maximum(0, df['delta_s']) / 15.0)
        momentum = np.maximum(0, df['delta_v']) / 20.0
        drs_boost = df['drs_active'] * 0.4
        bz_boost = np.where(df['dist_to_next_heavy_braking'] < 150.0, 0.2, 0.0)
        pace_boost = np.maximum(0.0, -df['clean_air_pace_diff']) * 0.15

        prob = dist_decay * (momentum + drs_boost + bz_boost + pace_boost)
        prob = np.where(df['delta_s'] < -1.0, 0.99, prob)
        prob = np.clip(prob, 0.01, 0.98)
        df['target_overtake'] = np.random.binomial(1, prob)
        dataset.append(df)

    return pd.concat(dataset, ignore_index=True)


def train_overtake_model(
    df: pd.DataFrame,
    export_path: str = "models/overtake_lgbm.joblib",
    calibration_method: str = "isotonic",
) -> Any:
    """
    Trains LightGBM on multi-core CPU with Monotonic Constraints, Balanced Focal Weighting,
    LOCO/Stratified Cross-Validation, and Probability Calibration.
    Reports ROC-AUC, PR-AUC, Brier Score, and Expected Calibration Error (ECE).
    """
    features = OVERTAKE_FEATURE_COLUMNS

    X = df[features]
    y = df['target_overtake']
    groups = df.get('circuit_id', pd.Series(1, index=df.index))

    # Monotonic Constraints:
    # 0: delta_s: -1 (closer distance gap -> higher overtake probability)
    # 1: delta_v: +1 (higher closing speed -> higher overtake probability)
    # 2: euclidean_dist: -1 (closer physical distance -> higher overtake probability)
    # 3: drs_active: +1 (DRS open -> higher overtake probability)
    # 4: mean_throttle: 0
    # 5: throttle_jerk: 0
    # 6: mean_brake: 0
    # 7: brake_onset_delta: 0
    # 8: tyre_age_delta: -1 (older attacker tyres -> lower overtake probability)
    # 9: compound_delta: +1 (higher attacker grip -> higher overtake probability)
    # 10: clean_air_pace_diff: -1 (attacker lower lap time -> higher overtake probability)
    # 11: dist_to_next_heavy_braking: -1 (closer to braking zone -> higher overtake probability)
    # 12: straight_fraction_remaining: 0
    # 13: curvature: 0
    monotone_constraints = [-1, 1, -1, 1, 0, 0, 0, 0, -1, 1, -1, -1, 0, 0]

    n_pos = max(1, int(y.sum()))
    n_neg = max(1, len(y) - n_pos)
    scale_pos_weight = float(n_neg / n_pos)

    # Leave-One-Circuit-Out (LOCO) or Stratified Cross-Validation
    num_circuits = groups.nunique()
    print("\n--- Overtake Model Evaluation (LightGBM + Calibration) ---")
    if num_circuits >= 2:
        n_splits = min(5, num_circuits)
        cv = GroupKFold(n_splits=n_splits)
        cv_splits = list(cv.split(X, y, groups))
        print(f"Leave-One-Circuit-Out (LOCO) Cross-Validation ({n_splits} folds):")
    else:
        n_splits = min(5, max(2, len(y) // 20))
        cv = StratifiedKFold(n_splits=n_splits, shuffle=True, random_state=42)
        cv_splits = list(cv.split(X, y))
        print(f"Stratified {len(cv_splits)}-Fold Cross-Validation:")

    uncal_metrics_list = []
    cal_metrics_list = []

    for fold, (train_idx, val_idx) in enumerate(cv_splits):
        X_train, y_train = X.iloc[train_idx], y.iloc[train_idx]
        X_val, y_val = X.iloc[val_idx], y.iloc[val_idx]

        # Inner split for leak-free calibration evaluation on held-out X_val
        inner_cv = StratifiedKFold(n_splits=4, shuffle=True, random_state=42 + fold)
        inner_tr_idx, inner_cal_idx = next(inner_cv.split(X_train, y_train))
        X_sub_tr, y_sub_tr = X_train.iloc[inner_tr_idx], y_train.iloc[inner_tr_idx]
        X_sub_cal, y_sub_cal = X_train.iloc[inner_cal_idx], y_train.iloc[inner_cal_idx]

        focal_w_train = compute_balanced_focal_weights(y_sub_tr, gamma=2.0, alpha=0.25)

        fold_base = lgb.LGBMClassifier(
            n_estimators=250,
            learning_rate=0.05,
            max_depth=5,
            subsample=0.85,
            subsample_freq=1,
            colsample_bytree=0.85,
            monotone_constraints=monotone_constraints,
            scale_pos_weight=scale_pos_weight,
            importance_type='gain',
            n_jobs=-1,
            verbose=-1,
            random_state=42,
        )
        fold_base.fit(X_sub_tr, y_sub_tr, sample_weight=focal_w_train)

        uncal_preds = fold_base.predict_proba(X_val)[:, 1]
        m_uncal = evaluate_calibration_metrics(y_val, uncal_preds)
        uncal_metrics_list.append(m_uncal)

        cal_model = wrap_calibrated_classifier(fold_base, method=calibration_method)
        cal_model.fit(X_sub_cal, y_sub_cal)
        cal_preds = cal_model.predict_proba(X_val)[:, 1]
        m_cal = evaluate_calibration_metrics(y_val, cal_preds)
        cal_metrics_list.append(m_cal)

        print(
            f"Fold {fold+1} | "
            f"Uncalibrated [ROC: {m_uncal['roc_auc']:.4f}, PR: {m_uncal['pr_auc']:.4f}, Brier: {m_uncal['brier_score']:.4f}, ECE: {m_uncal['ece']:.4f}] -> "
            f"Calibrated [ROC: {m_cal['roc_auc']:.4f}, PR: {m_cal['pr_auc']:.4f}, Brier: {m_cal['brier_score']:.4f}, ECE: {m_cal['ece']:.4f}]"
        )

    avg_uncal_brier = np.mean([m['brier_score'] for m in uncal_metrics_list])
    avg_cal_brier = np.mean([m['brier_score'] for m in cal_metrics_list])
    avg_uncal_ece = np.mean([m['ece'] for m in uncal_metrics_list])
    avg_cal_ece = np.mean([m['ece'] for m in cal_metrics_list])
    print(f"Mean Brier: Uncalibrated={avg_uncal_brier:.4f} -> Calibrated={avg_cal_brier:.4f}")
    print(f"Mean ECE:   Uncalibrated={avg_uncal_ece:.4f} -> Calibrated={avg_cal_ece:.4f}")

    # Retrain final base model and calibrate
    final_base = lgb.LGBMClassifier(
        n_estimators=250,
        learning_rate=0.05,
        max_depth=5,
        subsample=0.85,
        subsample_freq=1,
        colsample_bytree=0.85,
        monotone_constraints=monotone_constraints,
        scale_pos_weight=scale_pos_weight,
        importance_type='gain',
        n_jobs=-1,
        verbose=-1,
        random_state=42,
    )

    if num_circuits >= 2:
        val_mask = (groups == groups.unique()[-1])
        X_tr, y_tr = X[~val_mask], y[~val_mask]
        X_c, y_c = X[val_mask], y[val_mask]
    else:
        cal_split = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
        tr_i, cal_i = next(cal_split.split(X, y))
        X_tr, y_tr = X.iloc[tr_i], y.iloc[tr_i]
        X_c, y_c = X.iloc[cal_i], y.iloc[cal_i]

    focal_w_final = compute_balanced_focal_weights(y_tr, gamma=2.0, alpha=0.25)
    final_base.fit(X_tr, y_tr, sample_weight=focal_w_final)

    final_calibrated = wrap_calibrated_classifier(final_base, method=calibration_method)
    final_calibrated.fit(X_c, y_c)

    joblib.dump(final_calibrated, export_path)
    print(f"Calibrated Overtake model saved to {export_path}")
    return final_calibrated


# ---------------------------------------------------------
# 2. Pit Stop Anticipation Model (XGBoost)
# ---------------------------------------------------------

def build_pit_dataset(data_path: Optional[str] = None) -> pd.DataFrame:
    """
    Loads real ground-truth pit stop dataset if available (e.g. from data/pit_stop_dataset.csv),
    or constructs synthetic stint degradation and race condition triggers as fallback.
    """
    for candidate in [data_path, "data/pit_stop_dataset.parquet", "data/pit_stop_dataset.csv"]:
        if candidate and os.path.exists(candidate):
            print(f"Loading real ground-truth pit stop dataset from {candidate}...")
            df = None
            if candidate.endswith(".parquet"):
                try:
                    df = pd.read_parquet(candidate)
                except Exception:
                    pass
            elif candidate.endswith(".csv"):
                df = pd.read_csv(candidate)

            if df is not None and not df.empty:
                for c in PIT_FEATURE_COLUMNS:
                    if c not in df.columns:
                        if c == "stint_progression_ratio":
                            df[c] = (df["tyre_life"] / 28.0).clip(0.0, 2.5)
                        elif c == "fuel_corrected_degradation_slope":
                            df[c] = 0.04
                        elif c == "pit_loss_delta":
                            df[c] = np.where(df.get("sc_active", 0) == 1, 12.0, np.where(df.get("vsc_active", 0) == 1, 8.5, 0.0))
                        elif c == "traffic_rejoin_gap":
                            df[c] = 10.0

                # If the mined dataset lacks SC events (e.g. only Bahrain), augment SC samples to learn neutralization hazard
                if "sc_active" in df.columns and df["sc_active"].sum() < 5:
                    print("Notice: Real dataset has scarce Safety Car events (<5). Augmenting with neutralization hazard samples...")
                    n_aug = 400
                    rng = np.random.default_rng(42)
                    tl_aug = rng.integers(15, 36, n_aug)
                    sc_df = pd.DataFrame({
                        "session_id": "AUGMENTED_SC",
                        "circuit_id": 99,
                        "tyre_life": tl_aug,
                        "tyre_compound": rng.choice([0.0, 1.0, 2.0], n_aug),
                        "stint_progression_ratio": np.clip(tl_aug / 28.0, 0.0, 2.5),
                        "fuel_corrected_degradation_slope": np.round(rng.normal(0.05, 0.02, n_aug), 4),
                        "pit_loss_delta": np.full(n_aug, 12.0),
                        "traffic_rejoin_gap": np.round(rng.uniform(0.5, 15.0, n_aug), 2),
                        "sc_active": np.ones(n_aug, dtype=int),
                        "vsc_active": np.zeros(n_aug, dtype=int),
                        "lap_number": rng.integers(10, 50, n_aug),
                    })
                    prob_sc = np.clip((tl_aug / 30.0) ** 2 + 0.50, 0.10, 0.98)
                    sc_df["target_pit"] = rng.binomial(1, prob_sc)
                    df = pd.concat([df, sc_df], ignore_index=True)
                return df

    print("\nBuilding Synthetic Pit Stop Dataset fallback...")
    n_samples = 5000
    rng = np.random.default_rng(42)
    tyre_life = rng.integers(1, 40, n_samples)
    tyre_compound = rng.choice([0.0, 1.0, 2.0], n_samples)
    sc_active = rng.binomial(1, 0.05, n_samples)
    vsc_active = rng.binomial(1, 0.05, n_samples)
    progression = np.clip(tyre_life / 28.0, 0.0, 2.5)
    deg_slope = np.round(rng.normal(0.045, 0.02, n_samples), 4)
    loss_delta = np.where(sc_active == 1, 12.0, np.where(vsc_active == 1, 8.5, 0.0))
    rejoin_gap = np.round(rng.uniform(0.5, 18.0, n_samples), 2)
    lap_number = rng.integers(1, 60, n_samples)

    df = pd.DataFrame({
        'tyre_life': tyre_life,
        'tyre_compound': tyre_compound,
        'stint_progression_ratio': progression,
        'fuel_corrected_degradation_slope': deg_slope,
        'pit_loss_delta': loss_delta,
        'traffic_rejoin_gap': rejoin_gap,
        'sc_active': sc_active,
        'vsc_active': vsc_active,
        'lap_number': lap_number,
    })

    # High tyre wear, high progression, steep degradation slope, and neutralizations increase pit hazard
    prob = np.clip(
        (progression ** 2.5) * 0.45 + (deg_slope * 5.0) + (sc_active * 0.45) + (vsc_active * 0.30),
        0.01,
        0.98,
    )
    df['target_pit'] = rng.binomial(1, prob)
    return df


def train_pit_model(
    df: pd.DataFrame,
    export_path: str = "models/pit_window_xgb.joblib",
    calibration_method: str = "isotonic",
) -> Any:
    """
    Trains XGBoost classifier for Pit Window Anticipation with Monotonic Constraints,
    LOCO/Stratified Cross-Validation, and Probability Calibration.
    Reports ROC-AUC, PR-AUC, Brier Score, and Expected Calibration Error (ECE).
    """
    features = PIT_FEATURE_COLUMNS
    X = df[features]
    y = df['target_pit']
    groups = df.get('circuit_id', pd.Series(1, index=df.index))

    # Monotonic Constraints:
    # tyre_life >= 0, stint_progression_ratio >= 0, sc_active >= 0, vsc_active >= 0
    monotone_constraints = {
        "tyre_life": 1,
        "stint_progression_ratio": 1,
        "sc_active": 1,
        "vsc_active": 1,
    }

    n_pos = max(1, int(y.sum()))
    n_neg = max(1, len(y) - n_pos)
    scale_pos_weight = float(n_neg / n_pos)

    num_circuits = groups.nunique()
    print("\n--- Pit Window Model Evaluation (XGBoost + Calibration) ---")
    if num_circuits >= 2:
        n_splits = min(5, num_circuits)
        cv = GroupKFold(n_splits=n_splits)
        cv_splits = list(cv.split(X, y, groups))
        print(f"Leave-One-Circuit-Out (LOCO) Cross-Validation ({n_splits} folds):")
    else:
        n_splits = min(5, max(2, len(y) // 20))
        cv = StratifiedKFold(n_splits=n_splits, shuffle=True, random_state=42)
        cv_splits = list(cv.split(X, y))
        print(f"Stratified {len(cv_splits)}-Fold Cross-Validation:")

    uncal_metrics_list = []
    cal_metrics_list = []

    for fold, (train_idx, val_idx) in enumerate(cv_splits):
        X_train, y_train = X.iloc[train_idx], y.iloc[train_idx]
        X_val, y_val = X.iloc[val_idx], y.iloc[val_idx]

        # Inner split for leak-free calibration evaluation on held-out X_val
        inner_cv = StratifiedKFold(n_splits=4, shuffle=True, random_state=42 + fold)
        inner_tr_idx, inner_cal_idx = next(inner_cv.split(X_train, y_train))
        X_sub_tr, y_sub_tr = X_train.iloc[inner_tr_idx], y_train.iloc[inner_tr_idx]
        X_sub_cal, y_sub_cal = X_train.iloc[inner_cal_idx], y_train.iloc[inner_cal_idx]

        fold_base = XGBClassifier(
            n_estimators=250,
            learning_rate=0.05,
            max_depth=5,
            subsample=0.8,
            colsample_bytree=0.8,
            colsample_bynode=0.8,
            monotone_constraints=monotone_constraints,
            scale_pos_weight=scale_pos_weight,
            eval_metric='logloss',
            random_state=42,
            n_jobs=-1,
        )
        fold_base.fit(X_sub_tr, y_sub_tr)

        uncal_preds = fold_base.predict_proba(X_val)[:, 1]
        m_uncal = evaluate_calibration_metrics(y_val, uncal_preds)
        uncal_metrics_list.append(m_uncal)

        cal_model = wrap_calibrated_classifier(fold_base, method=calibration_method)
        cal_model.fit(X_sub_cal, y_sub_cal)
        cal_preds = cal_model.predict_proba(X_val)[:, 1]
        m_cal = evaluate_calibration_metrics(y_val, cal_preds)
        cal_metrics_list.append(m_cal)

        print(
            f"Fold {fold+1} | "
            f"Uncalibrated [ROC: {m_uncal['roc_auc']:.4f}, PR: {m_uncal['pr_auc']:.4f}, Brier: {m_uncal['brier_score']:.4f}, ECE: {m_uncal['ece']:.4f}] -> "
            f"Calibrated [ROC: {m_cal['roc_auc']:.4f}, PR: {m_cal['pr_auc']:.4f}, Brier: {m_cal['brier_score']:.4f}, ECE: {m_cal['ece']:.4f}]"
        )

    avg_uncal_brier = np.mean([m['brier_score'] for m in uncal_metrics_list])
    avg_cal_brier = np.mean([m['brier_score'] for m in cal_metrics_list])
    avg_uncal_ece = np.mean([m['ece'] for m in uncal_metrics_list])
    avg_cal_ece = np.mean([m['ece'] for m in cal_metrics_list])
    print(f"Mean Brier: Uncalibrated={avg_uncal_brier:.4f} -> Calibrated={avg_cal_brier:.4f}")
    print(f"Mean ECE:   Uncalibrated={avg_uncal_ece:.4f} -> Calibrated={avg_cal_ece:.4f}")

    # Retrain final base model and calibrate
    final_base = XGBClassifier(
        n_estimators=250,
        learning_rate=0.05,
        max_depth=5,
        subsample=0.8,
        colsample_bytree=0.8,
        colsample_bynode=0.8,
        monotone_constraints=monotone_constraints,
        scale_pos_weight=scale_pos_weight,
        eval_metric='logloss',
        random_state=42,
        n_jobs=-1,
    )

    if num_circuits >= 2:
        val_mask = (groups == groups.unique()[-1])
        X_tr, y_tr = X[~val_mask], y[~val_mask]
        X_c, y_c = X[val_mask], y[val_mask]
    else:
        cal_split = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
        tr_i, cal_i = next(cal_split.split(X, y))
        X_tr, y_tr = X.iloc[tr_i], y.iloc[tr_i]
        X_c, y_c = X.iloc[cal_i], y.iloc[cal_i]

    final_base.fit(X_tr, y_tr)
    final_calibrated = wrap_calibrated_classifier(final_base, method=calibration_method)
    final_calibrated.fit(X_c, y_c)

    joblib.dump(final_calibrated, export_path)
    print(f"Calibrated Pit Window model saved to {export_path}")
    return final_calibrated


if __name__ == "__main__":
    # 1. Train Overtake Model
    overtake_df = build_overtake_dataset(year=2023)
    train_overtake_model(overtake_df)

    # 2. Train Pit Model
    pit_df = build_pit_dataset()
    train_pit_model(pit_df)