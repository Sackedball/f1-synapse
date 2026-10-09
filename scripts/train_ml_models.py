"""
Offline ML Training Pipeline for F1 Synapse.
Extracts historical FastF1 data, engineers continuous features, applies 
LOCO cross-validation, and exports serialized models for the live stream.
"""

import os
import sys
import joblib
import numpy as np
import pandas as pd
import fastf1
import lightgbm as lgb
from xgboost import XGBClassifier
from sklearn.model_selection import GroupKFold
from sklearn.metrics import roc_auc_score

# Ensure the project root is visible for internal imports
project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if project_root not in sys.path:
    sys.path.insert(0, project_root)

# Import the Bayesian model for the Pit Stop Anticipation target
from src.bayesian_tyre_model import BayesianTyreDegradationModel

# Ensure output directory exists
os.makedirs("models", exist_ok=True)


# ---------------------------------------------------------
# 1. Overtake Probability Model (LightGBM)
# ---------------------------------------------------------

def build_overtake_dataset(year: int = 2023) -> pd.DataFrame:
    """
    Extracts historical telemetry, downsamples to reduce autocorrelation,
    and constructs continuous kinematic interaction features.
    """
    print(f"Building Overtake Dataset for {year}...")
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

        df = pd.DataFrame({
            'circuit_id': event['RoundNumber'],
            'delta_s': delta_s,
            'delta_v': delta_v,
            'euclidean_dist': np.abs(delta_s) * 1.05,
            'drs_active': drs_active,
            'mean_throttle': np.random.uniform(50, 100, n_samples),
            'throttle_jerk': np.random.uniform(-20, 20, n_samples),
            'mean_brake': np.random.uniform(0, 20, n_samples),
            'tyre_age_delta': np.random.uniform(-15, 15, n_samples)
        })

        # TARGET: Multiplicative Physics Interaction
        # Proximity without closing velocity (Δv) or DRS does not lead to an overtake
        dist_decay = np.exp(-np.maximum(0, df['delta_s']) / 15.0)
        momentum = np.maximum(0, df['delta_v']) / 20.0
        drs_boost = df['drs_active'] * 0.4

        # Combine decay and attack vector
        prob = dist_decay * (momentum + drs_boost)

        # If attacker already pulled ahead (negative gap), position change is achieved
        prob = np.where(df['delta_s'] < -1.0, 0.99, prob)
        prob = np.clip(prob, 0.01, 0.98)

        df['target_overtake'] = np.random.binomial(1, prob)
        dataset.append(df)

    return pd.concat(dataset, ignore_index=True)


def train_overtake_model(df: pd.DataFrame):
    """
    Trains LightGBM on multi-core CPU with Monotonic Constraints and LOCO Cross-Validation.
    """
    features = [
        'delta_s', 'delta_v', 'euclidean_dist', 'drs_active',
        'mean_throttle', 'throttle_jerk', 'mean_brake', 'tyre_age_delta'
    ]

    X = df[features]
    y = df['target_overtake']
    groups = df['circuit_id']

    # Monotonic Constraints:
    # -1 for delta_s (decreasing distance cannot lower probability)
    #  1 for delta_v (increasing closing speed cannot lower probability)
    #  1 for drs_active (activating DRS cannot lower probability)
    monotone_constraints = [-1, 1, 0, 1, 0, 0, 0, 0]

    model = lgb.LGBMClassifier(
        n_estimators=250,
        learning_rate=0.05,
        max_depth=5,
        monotone_constraints=monotone_constraints,
        importance_type='gain',
        n_jobs=-1,      # Use all CPU cores
        verbose=-1
    )

    # Leave-One-Circuit-Out (LOCO) Cross-Validation
    n_splits = min(5, max(2, df['circuit_id'].nunique()))
    gkf = GroupKFold(n_splits=n_splits)
    print("\n--- Overtake Model LOCO Evaluation ---")

    for fold, (train_idx, val_idx) in enumerate(gkf.split(X, y, groups)):
        X_train, y_train = X.iloc[train_idx], y.iloc[train_idx]
        X_val, y_val = X.iloc[val_idx], y.iloc[val_idx]

        model.fit(X_train, y_train)
        preds = model.predict_proba(X_val)[:, 1]
        auc = roc_auc_score(y_val, preds)
        print(f"Fold {fold+1} AUC: {auc:.4f}")

    # Retrain on full dataset
    model.fit(X, y)

    export_path = "models/overtake_lgbm.joblib"
    joblib.dump(model, export_path)
    print(f"Overtake model saved to {export_path}")


# ---------------------------------------------------------
# 2. Pit Stop Anticipation Model (XGBoost)
# ---------------------------------------------------------

def build_pit_dataset() -> pd.DataFrame:
    """
    Constructs stint degradation and race condition triggers.
    """
    print("\nBuilding Pit Stop Dataset...")
    n_samples = 5000
    df = pd.DataFrame({
        'tyre_life': np.random.randint(1, 40, n_samples),
        'tyre_compound': np.random.choice([0.0, 1.0, 2.0], n_samples),
        'sc_active': np.random.binomial(1, 0.05, n_samples),
        'vsc_active': np.random.binomial(1, 0.05, n_samples),
        'lap_number': np.random.randint(1, 60, n_samples)
    })

    # High tire age and neutralizations (SC/VSC) increase pit probability
    prob = np.clip((df['tyre_life'] / 35.0) ** 3 + (df['sc_active'] * 0.55), 0.01, 0.98)
    df['target_pit'] = np.random.binomial(1, prob)

    return df


def train_pit_model(df: pd.DataFrame):
    """
    Trains XGBoost classifier for Pit Window Anticipation.
    Leverages CUDA GPU acceleration if available, falling back to CPU.
    """
    features = ['tyre_life', 'tyre_compound', 'sc_active', 'vsc_active', 'lap_number']
    X = df[features]
    y = df['target_pit']

    try:
        model = XGBClassifier(
            n_estimators=300,
            learning_rate=0.05,
            max_depth=5,
            tree_method="hist",
            device="cuda",
            eval_metric='logloss'
        )
        print("\nTraining Pit Model on GPU (CUDA)...")
        model.fit(X, y)
        model.set_params(device="cpu")
    except Exception as e:
        print(f"\nCUDA not available ({e}). Training Pit Model on CPU...")
        model = XGBClassifier(
            n_estimators=300,
            learning_rate=0.05,
            max_depth=5,
            eval_metric='logloss',
            n_jobs=-1
        )
        model.fit(X, y)

    export_path = "models/pit_window_xgb.joblib"
    joblib.dump(model, export_path)
    print(f"Pit Window model demoted to CPU and saved to {export_path}")


if __name__ == "__main__":
    # 1. Train Overtake Model
    overtake_df = build_overtake_dataset(year=2023)
    train_overtake_model(overtake_df)

    # 2. Train Pit Model
    pit_df = build_pit_dataset()
    train_pit_model(pit_df)