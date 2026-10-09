# Explanation: train_ml_models.py

## High-Level Overview
`scripts/train_ml_models.py` is an offline machine learning pipeline responsible for training, evaluating, and exporting predictive race analytics models for the Formula 1 Race Replay system.

Specifically, it constructs synthetic/augmented datasets grounded in real race telemetry heuristics and trains two serialized models:
1. **Overtake Probability Model (`models/overtake_lgbm.joblib`)**: Uses a LightGBM classifier with physics-informed monotonic constraints to predict the probability that a pursuing car will complete an overtake on a target car.
2. **Pit Window Anticipation Model (`models/pit_window_xgb.joblib`)**: Uses an XGBoost classifier to estimate the likelihood of an imminent pit stop based on tyre degradation, compound hardness, race neutralizations (Safety Car / VSC), and race lap progression.

---

## Dependencies

### Standard Library
- `os`, `sys`: Path manipulations, directory management (`models/`), and path insertion for root project imports.

### External Libraries
- `numpy`: Numerical calculations, random distributions, exponential distance decay calculations, and probabilistic target generation.
- `pandas`: Tabular data construction, manipulation, and feature engineering.
- `joblib`: Model serialization to `.joblib` files.
- `fastf1`: Retrieves real historical session schedules, event information, and lap telemetry.
- `lightgbm`: Gradient boosting decision tree framework used for overtake probability prediction with monotonic constraints.
- `xgboost.XGBClassifier`: Extreme Gradient Boosting classifier for pit stop window prediction.
- `sklearn.model_selection.GroupKFold`: Implements Leave-One-Circuit-Out (LOCO) cross-validation grouped by circuit ID.
- `sklearn.metrics.roc_auc_score`: Computes Receiver Operating Characteristic Area Under Curve (ROC-AUC) performance metric across validation folds.

### Internal Modules
- `src.bayesian_tyre_model.BayesianTyreDegradationModel`: Reference/interface for Bayesian tyre degradation modeling.

---

## Classes & Functions

### Functions

#### `build_overtake_dataset(year: int = 2023) -> pd.DataFrame`
- **Purpose**: Generates a training dataset of car-to-car kinematic interaction features across multiple circuits.
- **Inputs**:
  - `year` (*int*): Championship season to fetch events from (default: `2023`).
- **Outputs**:
  - `pd.DataFrame`: Synthetic dataset of 25,000+ interaction records across 5 circuits with calculated ground-truth targets.
- **Features Engineered**:
  - `delta_s`: Relative track gap in meters between two cars.
  - `delta_v`: Relative closing speed (m/s).
  - `euclidean_dist`: Spatial distance between cars.
  - `drs_active`: Binary indicator of DRS activation (0 or 1).
  - `mean_throttle`, `throttle_jerk`, `mean_brake`: Longitudinal control dynamics.
  - `tyre_age_delta`: Difference in laps run on current tyres between cars.
  - `circuit_id`: Grouping key for cross-validation.
- **Physics Target Construction**:
  Combines exponential spatial distance decay \(\exp(-\max(0, \Delta s) / 15.0)\) multiplied by forward momentum \((\max(0, \Delta v) / 20.0)\) plus DRS bonus (+0.4) to simulate realistic aerodynamic slipstream overtaking dynamics.

#### `train_overtake_model(df: pd.DataFrame)`
- **Purpose**: Trains a LightGBM classifier enforcing monotonic constraints and conducts Leave-One-Circuit-Out (LOCO) cross-validation.
- **Inputs**:
  - `df` (*pd.DataFrame*): Output from `build_overtake_dataset()`.
- **Outputs**: None (serializes trained model to `models/overtake_lgbm.joblib`).
- **Core Algorithms & Settings**:
  - **Monotonic Constraints**: Forces domain physics rules into the tree building:
    - `delta_s` = `-1`: A smaller distance gap can never decrease overtake probability.
    - `delta_v` = `+1`: Higher closing speed can never decrease overtake probability.
    - `drs_active` = `+1`: Activating DRS can never decrease overtake probability.
  - **LOCO Cross-Validation**: Uses `GroupKFold(n_splits=5)` grouping on `circuit_id` to evaluate cross-circuit generalization without data leakage.

#### `build_pit_dataset() -> pd.DataFrame`
- **Purpose**: Constructs feature matrices representing tyre wear and track safety status.
- **Inputs**: None.
- **Outputs**:
  - `pd.DataFrame`: Dataset with 5,000 samples containing tyre life, compound, Safety Car status, and pit stop targets.
- **Core Logic**:
  Probability of a pit stop scales cubicly with tyre age \((t_{\text{life}} / 35.0)^3\) and surges dramatically during track neutralizations (`+0.55` under Safety Car).

#### `train_pit_model(df: pd.DataFrame)`
- **Purpose**: Trains an XGBoost classifier for pit stop window classification.
- **Inputs**:
  - `df` (*pd.DataFrame*): Output from `build_pit_dataset()`.
- **Outputs**: None (serializes trained model to `models/pit_window_xgb.joblib`).
- **Hardware Acceleration**:
  Attempts training on NVIDIA GPUs using CUDA (`device="cuda"`, `tree_method="hist"`). If CUDA is unavailable or fails, gracefully falls back to multi-core CPU execution (`n_jobs=-1`), resetting `device="cpu"` before serialization to ensure universal inference compatibility on any client machine.
