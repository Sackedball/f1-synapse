import math
from typing import Dict, Optional, Any
import numpy as np
import pandas as pd
import xgboost as xgb
from src.ml.registry import ModelRegistry
from src.ml.features import PIT_FEATURE_COLUMNS


def unwrap_tree_estimator(model: Any) -> Any:
    """
    Extracts the underlying tree estimator (e.g. XGBClassifier or Booster)
    from a CalibratedClassifierCV or FrozenEstimator wrapper.
    """
    curr = model
    if hasattr(curr, "calibrated_classifiers_") and len(curr.calibrated_classifiers_) > 0:
        curr = curr.calibrated_classifiers_[0].estimator
    if hasattr(curr, "estimator") and curr.estimator is not None:
        curr = curr.estimator
    return curr


NOMINAL_PIT_DEFAULTS: Dict[str, float] = {
    "tyre_life": 15.0,
    "tyre_compound": 1.0,
    "stint_progression_ratio": 0.5,
    "fuel_corrected_degradation_slope": 0.03,
    "pit_loss_delta": 0.0,
    "traffic_rejoin_gap": 10.0,
    "sc_active": 0.0,
    "vsc_active": 0.0,
    "lap_number": 20.0,
}


def prepare_pit_dataframe(X: Any) -> pd.DataFrame:
    """
    Normalizes diverse inputs (dict, Series, DataFrame, list) into a full-feature
    DataFrame aligned with PIT_FEATURE_COLUMNS, filling missing or unobserved
    signals with domain-accurate nominal defaults.
    """
    if isinstance(X, pd.DataFrame):
        df = X.copy()
        if df.empty:
            return pd.DataFrame([NOMINAL_PIT_DEFAULTS], columns=PIT_FEATURE_COLUMNS)
        for col in PIT_FEATURE_COLUMNS:
            if col not in df.columns:
                if col == "tyre_compound" and "tyre" in df.columns:
                    df[col] = df["tyre"]
                elif col == "stint_progression_ratio" and "tyre_life" in df.columns:
                    df[col] = (df["tyre_life"] / 28.0).clip(0.0, 2.5)
                elif col == "pit_loss_delta":
                    sc = df.get("sc_active", 0)
                    vsc = df.get("vsc_active", 0)
                    df[col] = np.where(sc == 1, 12.0, np.where(vsc == 1, 8.5, 0.0))
                else:
                    df[col] = NOMINAL_PIT_DEFAULTS.get(col, 0.0)
            else:
                df[col] = df[col].fillna(NOMINAL_PIT_DEFAULTS.get(col, 0.0))
        return df[PIT_FEATURE_COLUMNS]

    row_dict: Dict[str, Any] = {}
    if isinstance(X, dict):
        row_dict = dict(X)
    elif isinstance(X, pd.Series):
        row_dict = X.to_dict()
    elif hasattr(X, "items"):
        row_dict = dict(X.items())

    feature_values: Dict[str, float] = {}
    for col in PIT_FEATURE_COLUMNS:
        if col in row_dict and not (isinstance(row_dict[col], float) and math.isnan(row_dict[col])):
            feature_values[col] = float(row_dict[col])
        elif col == "tyre_compound" and "tyre" in row_dict:
            feature_values[col] = float(row_dict["tyre"])
        elif col == "stint_progression_ratio" and "tyre_life" in row_dict:
            feature_values[col] = float(np.clip(float(row_dict["tyre_life"]) / 28.0, 0.0, 2.5))
        elif col == "pit_loss_delta" and ("sc_active" in row_dict or "vsc_active" in row_dict):
            sc = float(row_dict.get("sc_active", 0.0))
            vsc = float(row_dict.get("vsc_active", 0.0))
            feature_values[col] = 12.0 if sc > 0 else (8.5 if vsc > 0 else 0.0)
        else:
            feature_values[col] = NOMINAL_PIT_DEFAULTS.get(col, 0.0)

    return pd.DataFrame([feature_values], columns=PIT_FEATURE_COLUMNS)


class PitModel:
    """Predicts pit stop likelihood for a driver based on tyre stint and race condition with TreeSHAP explainability."""

    def __init__(self, model: Optional[Any] = None):
        self._model = model

    @property
    def model(self):
        if self._model is None:
            self._model = ModelRegistry.get_instance().pit_model
        return self._model

    def predict_likelihood(self, X: Any) -> float:
        """Predicts pit stop likelihood in range [0.01, 0.98]."""
        m = self.model
        if m is not None:
            try:
                df_feat = prepare_pit_dataframe(X)
                probs = m.predict_proba(df_feat)
                val = float(probs[0][1]) if probs.ndim == 2 else float(probs[0])
                if not math.isnan(val):
                    return float(min(0.98, max(0.01, val)))
            except Exception:
                pass

        return self._heuristic_pit(X)

    def _heuristic_pit(self, X: Any) -> float:
        try:
            if isinstance(X, dict):
                tyre_life = float(X.get("tyre_life", 15.0))
                tyre_compound = float(X.get("tyre_compound", 1.0))
                sc_active = float(X.get("sc_active", 0.0))
                vsc_active = float(X.get("vsc_active", 0.0))
                progression = float(X.get("stint_progression_ratio", tyre_life / 28.0))
                deg_slope = float(X.get("fuel_corrected_degradation_slope", 0.03))
                loss_delta = float(X.get("pit_loss_delta", 0.0))
            elif isinstance(X, pd.DataFrame):
                tyre_life = float(X.iloc[0]["tyre_life"]) if "tyre_life" in X.columns else 15.0
                tyre_compound = float(X.iloc[0]["tyre_compound"]) if "tyre_compound" in X.columns else 1.0
                sc_active = float(X.iloc[0]["sc_active"]) if "sc_active" in X.columns else 0.0
                vsc_active = float(X.iloc[0].get("vsc_active", 0.0))
                progression = float(X.iloc[0].get("stint_progression_ratio", tyre_life / 28.0))
                deg_slope = float(X.iloc[0].get("fuel_corrected_degradation_slope", 0.03))
                loss_delta = float(X.iloc[0].get("pit_loss_delta", 0.0))
            else:
                tyre_life = float(X["tyre_life"])
                tyre_compound = float(X["tyre_compound"])
                sc_active = float(X["sc_active"])
                vsc_active = float(X.get("vsc_active", 0.0) if hasattr(X, "get") else 0.0)
                progression = float(X.get("stint_progression_ratio", tyre_life / 28.0) if hasattr(X, "get") else 0.5)
                deg_slope = float(X.get("fuel_corrected_degradation_slope", 0.03) if hasattr(X, "get") else 0.03)
                loss_delta = float(X.get("pit_loss_delta", 0.0) if hasattr(X, "get") else 0.0)
        except Exception:
            tyre_life, tyre_compound, sc_active, vsc_active = 15.0, 1.0, 0.0, 0.0
            progression, deg_slope, loss_delta = 0.5, 0.03, 0.0

        if math.isnan(tyre_life):
            tyre_life = 15.0
        if math.isnan(tyre_compound):
            tyre_compound = 1.0
        if math.isnan(sc_active):
            sc_active = 0.0
        if math.isnan(vsc_active):
            vsc_active = 0.0
        if math.isnan(progression):
            progression = 0.5
        if math.isnan(deg_slope):
            deg_slope = 0.03
        if math.isnan(loss_delta):
            loss_delta = 0.0

        effective_deg = max(0.01, deg_slope)
        pace_loss = tyre_life * effective_deg

        # Logistic curve: progression > 0.85 and pace loss > 1.0s accelerates pit likelihood
        crossover_loss = 1.1
        steepness = 5.0
        base_risk = 1.0 / (1.0 + np.exp(-steepness * (pace_loss - crossover_loss)))

        if sc_active or loss_delta >= 10.0:
            base_risk += 0.45
        elif vsc_active or loss_delta >= 8.0:
            base_risk += 0.30

        if math.isnan(base_risk):
            return 0.01
        return float(max(0.01, min(0.98, base_risk)))

    def explain(self, X: Any) -> Dict[str, float]:
        """
        Computes normalized feature contributions (+1.0 to -1.0) explaining why
        the pit stop probability is high or low using native TreeSHAP (pred_contribs)
        from the underlying XGBoost model, with robust heuristic fallback.
        """
        df_feat = prepare_pit_dataframe(X)

        m = self.model
        if m is not None:
            try:
                base_tree = unwrap_tree_estimator(m)
                booster = getattr(base_tree, "get_booster", None)
                if callable(booster):
                    b = booster()
                    dmat = xgb.DMatrix(df_feat[PIT_FEATURE_COLUMNS])
                    contribs = b.predict(dmat, pred_contribs=True)
                    raw_shap = contribs[0, :-1]  # drop bias/base value

                    shap_dict = {}
                    for col_name, shap_val in zip(PIT_FEATURE_COLUMNS, raw_shap):
                        norm_val = round(float(np.tanh(shap_val)), 3)
                        shap_dict[col_name] = norm_val

                    row_vals = df_feat.iloc[0].to_dict()
                    is_sc = (row_vals.get("sc_active", 0.0) > 0) or (row_vals.get("pit_loss_delta", 0.0) >= 10.0 and row_vals.get("vsc_active", 0.0) == 0)
                    is_vsc = (row_vals.get("vsc_active", 0.0) > 0) or (8.0 <= row_vals.get("pit_loss_delta", 0.0) < 10.0 and row_vals.get("sc_active", 0.0) == 0)

                    sc_attrib = shap_dict.get("sc_active", 0.0)
                    if is_sc and shap_dict.get("pit_loss_delta", 0.0) > sc_attrib:
                        sc_attrib = shap_dict.get("pit_loss_delta", 0.0)

                    vsc_attrib = shap_dict.get("vsc_active", 0.0)
                    if is_vsc and shap_dict.get("pit_loss_delta", 0.0) > vsc_attrib:
                        vsc_attrib = shap_dict.get("pit_loss_delta", 0.0)

                    stint_attrib = shap_dict.get("stint_progression_ratio", 0.0)
                    if stint_attrib == 0.0 and shap_dict.get("tyre_life", 0.0) != 0.0:
                        stint_attrib = round(shap_dict.get("tyre_life", 0.0) * 0.5, 3)

                    expl = {
                        "tyre_age": shap_dict.get("tyre_life", 0.0),
                        "compound_wear_rate": shap_dict.get("tyre_compound", 0.0),
                        "stint_progression": stint_attrib,
                        "degradation_slope": shap_dict.get("fuel_corrected_degradation_slope", 0.0),
                        "neutralization_advantage": shap_dict.get("pit_loss_delta", 0.0),
                        "traffic_window": shap_dict.get("traffic_rejoin_gap", 0.0),
                        "safety_car": sc_attrib,
                        "vsc": vsc_attrib,
                        "race_phase": shap_dict.get("lap_number", 0.0),
                    }
                    expl.update(shap_dict)
                    return expl
            except Exception:
                pass

        row_dict = df_feat.iloc[0].to_dict() if not df_feat.empty else {}
        return self._heuristic_pit_explain(row_dict)

    def _heuristic_pit_explain(self, X: Dict[str, Any]) -> Dict[str, float]:
        tyre_life = float(X.get("tyre_life", 15.0)) if not math.isnan(float(X.get("tyre_life", 15.0))) else 15.0
        sc_active = float(X.get("sc_active", 0.0)) if not math.isnan(float(X.get("sc_active", 0.0))) else 0.0
        vsc_active = float(X.get("vsc_active", 0.0)) if not math.isnan(float(X.get("vsc_active", 0.0))) else 0.0
        progression = float(X.get("stint_progression_ratio", 0.5)) if not math.isnan(float(X.get("stint_progression_ratio", 0.5))) else 0.5
        deg_slope = float(X.get("fuel_corrected_degradation_slope", 0.03)) if not math.isnan(float(X.get("fuel_corrected_degradation_slope", 0.03))) else 0.03
        loss_delta = float(X.get("pit_loss_delta", 0.0)) if not math.isnan(float(X.get("pit_loss_delta", 0.0))) else 0.0
        rejoin_gap = float(X.get("traffic_rejoin_gap", 10.0)) if not math.isnan(float(X.get("traffic_rejoin_gap", 10.0))) else 10.0

        tyre_impact = float(np.clip((tyre_life - 20.0) / 15.0, -1.0, 1.0))
        prog_impact = float(np.clip((progression - 0.8) / 0.5, -1.0, 1.0))
        sc_impact = 0.9 if sc_active > 0 else 0.0
        vsc_impact = 0.6 if vsc_active > 0 else 0.0
        deg_impact = float(np.clip((deg_slope - 0.03) / 0.03, -1.0, 1.0))
        neutral_impact = float(np.clip(loss_delta / 12.0, 0.0, 1.0))
        traffic_impact = float(np.clip((10.0 - rejoin_gap) / 10.0, -1.0, 1.0))

        expl = {
            "tyre_age": round(tyre_impact, 3),
            "stint_progression": round(prog_impact, 3),
            "safety_car": round(sc_impact, 3),
            "vsc": round(vsc_impact, 3),
            "degradation_slope": round(deg_impact, 3),
            "neutralization_advantage": round(neutral_impact, 3),
            "traffic_window": round(traffic_impact, 3),
            "tyre_life": round(tyre_impact, 3),
            "stint_progression_ratio": round(prog_impact, 3),
            "sc_active": round(sc_impact, 3),
            "vsc_active": round(vsc_impact, 3),
            "fuel_corrected_degradation_slope": round(deg_impact, 3),
            "pit_loss_delta": round(neutral_impact, 3),
            "traffic_rejoin_gap": round(traffic_impact, 3),
        }
        return expl
