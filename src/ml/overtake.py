"""
Overtake likelihood prediction model and feature explainability.
Wraps LightGBM binary classifier with robust heuristic fallbacks and feature contributions.
"""

from typing import Dict, Optional, Tuple, Any
import numpy as np
import pandas as pd
from src.ml.registry import ModelRegistry


class OvertakeModel:
    """Predicts overtake likelihood (next 5-10s) and generates feature contributions."""

    def __init__(self, model: Optional[Any] = None):
        self._model = model

    @property
    def model(self):
        if self._model is None:
            self._model = ModelRegistry.get_instance().overtake_model
        return self._model

    def predict_likelihood(self, X: pd.DataFrame) -> float:
        """Computes probability of successful overtake in range [0.01, 0.99]."""
        m = self.model
        if m is not None:
            try:
                probs = m.predict_proba(X)
                val = float(probs[0][1])
                return float(min(0.99, max(0.01, val)))
            except Exception:
                pass

        # Heuristic fallback matching legacy ML window
        return self._heuristic_overtake(X)

    def _heuristic_overtake(self, X: pd.DataFrame) -> float:
        delta_s = float(X.iloc[0]["delta_s"])
        delta_v = float(X.iloc[0]["delta_v"])
        drs = float(X.iloc[0]["drs_active"])

        if delta_s > 40.0:
            return 0.01
        if delta_s < -1.0:
            return 0.99

        dist_decay = float(np.exp(-max(0.0, delta_s) / 15.0))
        momentum = max(0.0, delta_v) / 20.0
        drs_boost = drs * 0.4

        prob = dist_decay * (momentum + drs_boost)
        return float(max(0.01, min(0.98, prob)))

    def explain(self, X: Any) -> Dict[str, float]:
        """
        Computes normalized percentage feature contributions (+1.0 to -1.0)
        explaining why the probability is high or low.
        Returns a dict of friendly feature names mapped to contributions.
        """
        if isinstance(X, dict):
            delta_s = float(X.get("delta_s", 0.0))
            delta_v = float(X.get("delta_v", 0.0))
            drs = float(X.get("drs_active", 0.0))
            tyre_delta = float(X.get("tyre_age_delta", 0.0))
        elif isinstance(X, pd.DataFrame):
            delta_s = float(X.iloc[0]["delta_s"])
            delta_v = float(X.iloc[0]["delta_v"])
            drs = float(X.iloc[0]["drs_active"])
            tyre_delta = float(X.iloc[0]["tyre_age_delta"])
        else:
            delta_s = float(X["delta_s"])
            delta_v = float(X["delta_v"])
            drs = float(X["drs_active"])
            tyre_delta = float(X["tyre_age_delta"])

        # Normalized feature impacts:
        # 1. Proximity Impact (closer is better, max impact at <= 5m)
        proximity_impact = float(np.clip(1.0 - (max(0.0, delta_s) / 25.0), -1.0, 1.0))

        # 2. Closing Speed Impact (positive delta_v is better, max at +15 km/h)
        speed_impact = float(np.clip(delta_v / 15.0, -1.0, 1.0))

        # 3. DRS Advantage
        drs_impact = 0.8 if drs > 0 else 0.0

        # 4. Tyre Freshness Delta (attacker tyre life - defender tyre life: negative is fresher attacker)
        tyre_impact = float(np.clip(-tyre_delta / 10.0, -1.0, 1.0))

        return {
            "proximity": round(proximity_impact, 3),
            "closing_speed": round(speed_impact, 3),
            "drs_boost": round(drs_impact, 3),
            "tyre_advantage": round(tyre_impact, 3),
        }
