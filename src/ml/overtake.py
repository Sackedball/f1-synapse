import math
from typing import Dict, Optional, Tuple, Any
import numpy as np
import pandas as pd
from src.ml.registry import ModelRegistry
from src.ml.features import OVERTAKE_FEATURE_COLUMNS


def unwrap_tree_estimator(model: Any) -> Any:
    """
    Extracts the underlying tree estimator (e.g. LGBMClassifier or Booster)
    from a CalibratedClassifierCV or FrozenEstimator wrapper.
    """
    curr = model
    if hasattr(curr, "calibrated_classifiers_") and len(curr.calibrated_classifiers_) > 0:
        curr = curr.calibrated_classifiers_[0].estimator
    if hasattr(curr, "estimator") and curr.estimator is not None:
        curr = curr.estimator
    return curr


NOMINAL_OVERTAKE_DEFAULTS: Dict[str, float] = {
    "delta_s": 20.0,
    "delta_v": 0.0,
    "euclidean_dist": 20.0,
    "drs_active": 0.0,
    "mean_throttle": 80.0,
    "throttle_jerk": 0.0,
    "mean_brake": 0.0,
    "brake_onset_delta": 0.0,
    "tyre_age_delta": 0.0,
    "compound_delta": 0.0,
    "clean_air_pace_diff": 0.0,
    "dist_to_next_heavy_braking": 999.0,
    "straight_fraction_remaining": 0.5,
    "curvature": 0.002,
}


def prepare_overtake_dataframe(X: Any) -> pd.DataFrame:
    """
    Normalizes diverse inputs (dict, Series, DataFrame, list) into a full-feature
    DataFrame aligned with OVERTAKE_FEATURE_COLUMNS, filling missing or unobserved
    signals with domain-accurate nominal defaults.
    """
    if isinstance(X, pd.DataFrame):
        df = X.copy()
        if df.empty:
            return pd.DataFrame([NOMINAL_OVERTAKE_DEFAULTS], columns=OVERTAKE_FEATURE_COLUMNS)
        for col in OVERTAKE_FEATURE_COLUMNS:
            if col not in df.columns:
                if col == "clean_air_pace_diff" and "clean_air_pace_advantage" in df.columns:
                    df[col] = -df["clean_air_pace_advantage"]
                elif col == "dist_to_next_heavy_braking" and "dist_to_braking_zone" in df.columns:
                    df[col] = df["dist_to_braking_zone"]
                elif col == "euclidean_dist" and "delta_s" in df.columns:
                    df[col] = df["delta_s"].abs()
                else:
                    df[col] = NOMINAL_OVERTAKE_DEFAULTS.get(col, 0.0)
            else:
                df[col] = df[col].fillna(NOMINAL_OVERTAKE_DEFAULTS.get(col, 0.0))
        return df[OVERTAKE_FEATURE_COLUMNS]

    row_dict: Dict[str, Any] = {}
    if isinstance(X, dict):
        row_dict = dict(X)
    elif isinstance(X, pd.Series):
        row_dict = X.to_dict()
    elif hasattr(X, "items"):
        row_dict = dict(X.items())

    feature_values: Dict[str, float] = {}
    for col in OVERTAKE_FEATURE_COLUMNS:
        if col in row_dict and not (isinstance(row_dict[col], float) and math.isnan(row_dict[col])):
            feature_values[col] = float(row_dict[col])
        elif col == "clean_air_pace_diff" and "clean_air_pace_advantage" in row_dict:
            val = row_dict["clean_air_pace_advantage"]
            feature_values[col] = -float(val) if not (isinstance(val, float) and math.isnan(val)) else 0.0
        elif col == "dist_to_next_heavy_braking" and "dist_to_braking_zone" in row_dict:
            val = row_dict["dist_to_braking_zone"]
            feature_values[col] = float(val) if not (isinstance(val, float) and math.isnan(val)) else 999.0
        elif col == "euclidean_dist" and "delta_s" in row_dict:
            feature_values[col] = abs(float(row_dict["delta_s"]))
        else:
            feature_values[col] = NOMINAL_OVERTAKE_DEFAULTS.get(col, 0.0)

    return pd.DataFrame([feature_values], columns=OVERTAKE_FEATURE_COLUMNS)


class OvertakeModel:
    """Predicts overtake likelihood (next 5-10s) and generates TreeSHAP feature contributions."""

    def __init__(self, model: Optional[Any] = None):
        self._model = model

    @property
    def model(self):
        if self._model is None:
            self._model = ModelRegistry.get_instance().overtake_model
        return self._model

    def predict_likelihood(self, X: Any) -> float:
        """Computes probability of successful overtake in range [0.01, 0.99]."""
        m = self.model
        if m is not None:
            try:
                df_feat = prepare_overtake_dataframe(X)
                probs = m.predict_proba(df_feat)
                val = float(probs[0][1]) if probs.ndim == 2 else float(probs[0])
                if not math.isnan(val):
                    return float(min(0.99, max(0.01, val)))
            except Exception:
                pass

        # Heuristic fallback matching legacy ML window
        return self._heuristic_overtake(X)

    def _heuristic_overtake(self, X: Any) -> float:
        try:
            if isinstance(X, dict):
                delta_s = float(X.get("delta_s", 20.0))
                delta_v = float(X.get("delta_v", 0.0))
                drs = float(X.get("drs_active", 0.0))
                dist_bz = float(X.get("dist_to_next_heavy_braking", 999.0))
                pace_diff = float(X.get("clean_air_pace_diff", 0.0))
            elif isinstance(X, pd.DataFrame):
                delta_s = float(X.iloc[0]["delta_s"]) if "delta_s" in X.columns else 20.0
                delta_v = float(X.iloc[0]["delta_v"]) if "delta_v" in X.columns else 0.0
                drs = float(X.iloc[0]["drs_active"]) if "drs_active" in X.columns else 0.0
                dist_bz = float(X.iloc[0].get("dist_to_next_heavy_braking", 999.0))
                pace_diff = float(X.iloc[0].get("clean_air_pace_diff", 0.0))
            else:
                delta_s = float(X["delta_s"])
                delta_v = float(X["delta_v"])
                drs = float(X["drs_active"])
                dist_bz = float(X.get("dist_to_next_heavy_braking", 999.0) if hasattr(X, "get") else 999.0)
                pace_diff = float(X.get("clean_air_pace_diff", 0.0) if hasattr(X, "get") else 0.0)
        except Exception:
            delta_s, delta_v, drs, dist_bz, pace_diff = 20.0, 0.0, 0.0, 999.0, 0.0

        if math.isnan(delta_s):
            delta_s = 50.0
        if math.isnan(delta_v):
            delta_v = 0.0
        if math.isnan(drs):
            drs = 0.0
        if math.isnan(dist_bz):
            dist_bz = 999.0
        if math.isnan(pace_diff):
            pace_diff = 0.0

        if delta_s > 40.0:
            return 0.01
        if delta_s < -1.0:
            return 0.99

        dist_decay = float(np.exp(-max(0.0, delta_s) / 15.0))
        momentum = max(0.0, delta_v) / 20.0
        drs_boost = drs * 0.4
        bz_boost = 0.2 if dist_bz < 150.0 else 0.0
        pace_boost = max(0.0, -pace_diff) * 0.15

        prob = dist_decay * (momentum + drs_boost + bz_boost + pace_boost)
        if math.isnan(prob):
            return 0.01
        return float(max(0.01, min(0.98, prob)))

    def explain(self, X: Any) -> Dict[str, float]:
        """
        Computes normalized feature contributions (+1.0 to -1.0) explaining why
        the overtake probability is high or low using native TreeSHAP (pred_contrib)
        from the underlying decision tree ensemble, with robust heuristic fallback.
        """
        df_feat = prepare_overtake_dataframe(X)

        # Attempt Native TreeSHAP Attribution from the underlying LightGBM tree model
        m = self.model
        if m is not None:
            try:
                base_tree = unwrap_tree_estimator(m)
                booster = getattr(base_tree, "booster_", None)
                if booster is not None:
                    contribs = booster.predict(df_feat[OVERTAKE_FEATURE_COLUMNS], pred_contrib=True)
                    raw_shap = contribs[0, :-1]  # drop bias/base value

                    shap_dict = {}
                    for col_name, shap_val in zip(OVERTAKE_FEATURE_COLUMNS, raw_shap):
                        # Smoothly normalize SHAP log-odds contributions to (-1.0, 1.0) via tanh
                        norm_val = round(float(np.tanh(shap_val)), 3)
                        shap_dict[col_name] = norm_val

                    expl = {
                        "proximity": shap_dict.get("delta_s", 0.0),
                        "closing_speed": shap_dict.get("delta_v", 0.0),
                        "drs_boost": shap_dict.get("drs_active", 0.0),
                        "tyre_advantage": shap_dict.get("tyre_age_delta", 0.0),
                        "pace_advantage": shap_dict.get("clean_air_pace_diff", 0.0),
                        "braking_zone_proximity": shap_dict.get("dist_to_next_heavy_braking", 0.0),
                    }
                    expl.update(shap_dict)
                    return expl
            except Exception:
                pass

        # Fallback Heuristic Attribution if model is uninitialized or TreeSHAP fails
        row_dict = df_feat.iloc[0].to_dict() if not df_feat.empty else {}
        return self._heuristic_explain(row_dict)

    def _heuristic_explain(self, X: Dict[str, Any]) -> Dict[str, float]:
        delta_s = float(X.get("delta_s", 20.0)) if not math.isnan(float(X.get("delta_s", 20.0))) else 20.0
        delta_v = float(X.get("delta_v", 0.0)) if not math.isnan(float(X.get("delta_v", 0.0))) else 0.0
        drs = float(X.get("drs_active", 0.0)) if not math.isnan(float(X.get("drs_active", 0.0))) else 0.0
        tyre_delta = float(X.get("tyre_age_delta", 0.0)) if not math.isnan(float(X.get("tyre_age_delta", 0.0))) else 0.0
        pace_diff = float(X.get("clean_air_pace_diff", 0.0)) if not math.isnan(float(X.get("clean_air_pace_diff", 0.0))) else 0.0
        dist_bz = float(X.get("dist_to_next_heavy_braking", 999.0)) if not math.isnan(float(X.get("dist_to_next_heavy_braking", 999.0))) else 999.0

        proximity_impact = float(np.clip(1.0 - (max(0.0, delta_s) / 25.0), -1.0, 1.0))
        speed_impact = float(np.clip(delta_v / 15.0, -1.0, 1.0))
        drs_impact = 0.8 if drs > 0 else 0.0
        tyre_impact = float(np.clip(-tyre_delta / 10.0, -1.0, 1.0))

        expl = {
            "proximity": round(proximity_impact, 3),
            "closing_speed": round(speed_impact, 3),
            "drs_boost": round(drs_impact, 3),
            "tyre_advantage": round(tyre_impact, 3),
            "pace_advantage": round(float(np.clip(-pace_diff / 1.5, -1.0, 1.0)), 3) if pace_diff != 0.0 else 0.0,
            "braking_zone_proximity": round(float(np.clip(1.0 - (dist_bz / 150.0), -1.0, 1.0)), 3) if dist_bz < 900.0 else 0.0,
            "delta_s": round(proximity_impact, 3),
            "delta_v": round(speed_impact, 3),
            "drs_active": round(drs_impact, 3),
            "tyre_age_delta": round(tyre_impact, 3),
            "clean_air_pace_diff": round(float(np.clip(-pace_diff / 1.5, -1.0, 1.0)), 3) if pace_diff != 0.0 else 0.0,
            "dist_to_next_heavy_braking": round(float(np.clip(1.0 - (dist_bz / 150.0), -1.0, 1.0)), 3) if dist_bz < 900.0 else 0.0,
        }
        return expl
