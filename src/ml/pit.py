"""
Pit stop anticipation model.
Wraps XGBoost pit classification model with sigmoid degradation curve fallback.
"""

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
                probs = m.predict_proba(X)
                val = float(probs[0][1])
                return float(min(0.98, max(0.01, val)))
            except Exception:
                pass

        return self._heuristic_pit(X)

    def _heuristic_pit(self, X: pd.DataFrame) -> float:
        tyre_life = float(X.iloc[0]["tyre_life"])
        tyre_compound = float(X.iloc[0]["tyre_compound"])
        sc_active = float(X.iloc[0]["sc_active"])

        effective_deg = {0.0: 0.05, 1.0: 0.03, 2.0: 0.015}.get(tyre_compound, 0.03)
        pace_loss = tyre_life * effective_deg

        # Logistic curve: 1.1 seconds lost is the crossover point (50% probability)
        crossover_loss = 1.1
        steepness = 5.0
        base_risk = 1.0 / (1.0 + np.exp(-steepness * (pace_loss - crossover_loss)))

        if sc_active:
            base_risk += 0.45

        return float(max(0.01, min(0.98, base_risk)))
