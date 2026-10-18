import math
from typing import Optional, Any
import numpy as np
import pandas as pd
from src.ml.registry import ModelRegistry


class PitModel:
    """Predicts pit stop likelihood for a driver based on tyre stint and race condition."""

    def __init__(self, model: Optional[Any] = None):
        self._model = model

    @property
    def model(self):
        if self._model is None:
            self._model = ModelRegistry.get_instance().pit_model
        return self._model

    def predict_likelihood(self, X: pd.DataFrame) -> float:
        """Predicts pit stop likelihood in range [0.01, 0.98]."""
        m = self.model
        if m is not None:
            try:
                if hasattr(m, "feature_names_in_"):
                    cols = [c for c in m.feature_names_in_ if c in X.columns]
                    if len(cols) == len(m.feature_names_in_):
                        probs = m.predict_proba(X[cols])
                    else:
                        probs = m.predict_proba(X)
                else:
                    probs = m.predict_proba(X)
                val = float(probs[0][1])
                if not math.isnan(val):
                    return float(min(0.98, max(0.01, val)))
            except Exception:
                pass

        return self._heuristic_pit(X)

    def _heuristic_pit(self, X: pd.DataFrame) -> float:
        try:
            tyre_life = float(X.iloc[0]["tyre_life"])
        except Exception:
            tyre_life = 15.0
        try:
            tyre_compound = float(X.iloc[0]["tyre_compound"])
        except Exception:
            tyre_compound = 1.0
        try:
            sc_active = float(X.iloc[0]["sc_active"])
        except Exception:
            sc_active = 0.0
        try:
            vsc_active = float(X.iloc[0].get("vsc_active", 0.0))
        except Exception:
            vsc_active = 0.0
        try:
            progression = float(X.iloc[0].get("stint_progression_ratio", tyre_life / 28.0))
        except Exception:
            progression = 0.5
        try:
            deg_slope = float(X.iloc[0].get("fuel_corrected_degradation_slope", 0.03))
        except Exception:
            deg_slope = 0.03
        try:
            loss_delta = float(X.iloc[0].get("pit_loss_delta", 0.0))
        except Exception:
            loss_delta = 0.0

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
