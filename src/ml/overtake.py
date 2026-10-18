"""
Overtake likelihood prediction model and feature explainability.
Wraps LightGBM binary classifier with robust heuristic fallbacks and feature contributions.
"""

import math
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
                if hasattr(m, "feature_name_"):
                    cols = [c for c in m.feature_name_ if c in X.columns]
                    if len(cols) == len(m.feature_name_):
                        probs = m.predict_proba(X[cols])
                    else:
                        probs = m.predict_proba(X)
                else:
                    probs = m.predict_proba(X)
                val = float(probs[0][1])
                if not math.isnan(val):
                    return float(min(0.99, max(0.01, val)))
            except Exception:
                pass

        # Heuristic fallback matching legacy ML window
        return self._heuristic_overtake(X)

    def _heuristic_overtake(self, X: pd.DataFrame) -> float:
        try:
            delta_s = float(X.iloc[0]["delta_s"])
        except Exception:
            delta_s = 20.0
        try:
            delta_v = float(X.iloc[0]["delta_v"])
        except Exception:
            delta_v = 0.0
        try:
            drs = float(X.iloc[0]["drs_active"])
        except Exception:
            drs = 0.0
        try:
            dist_bz = float(X.iloc[0].get("dist_to_next_heavy_braking", 999.0))
        except Exception:
            dist_bz = 999.0
        try:
            pace_diff = float(X.iloc[0].get("clean_air_pace_diff", 0.0))
        except Exception:
            pace_diff = 0.0

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
        Computes normalized percentage feature contributions (+1.0 to -1.0)
        explaining why the probability is high or low.
        Returns a dict of friendly feature names mapped to contributions.
        """
        if isinstance(X, dict):
            delta_s = float(X.get("delta_s", 0.0))
            delta_v = float(X.get("delta_v", 0.0))
            drs = float(X.get("drs_active", 0.0))
            tyre_delta = float(X.get("tyre_age_delta", 0.0))
            pace_diff = float(X.get("clean_air_pace_diff", 0.0))
            dist_bz = float(X.get("dist_to_next_heavy_braking", 999.0))
        elif isinstance(X, pd.DataFrame):
            delta_s = float(X.iloc[0]["delta_s"]) if "delta_s" in X.columns else 0.0
            delta_v = float(X.iloc[0]["delta_v"]) if "delta_v" in X.columns else 0.0
            drs = float(X.iloc[0]["drs_active"]) if "drs_active" in X.columns else 0.0
            tyre_delta = float(X.iloc[0]["tyre_age_delta"]) if "tyre_age_delta" in X.columns else 0.0
            pace_diff = float(X.iloc[0].get("clean_air_pace_diff", 0.0))
            dist_bz = float(X.iloc[0].get("dist_to_next_heavy_braking", 999.0))
        else:
            delta_s = float(X["delta_s"])
            delta_v = float(X["delta_v"])
            drs = float(X["drs_active"])
            tyre_delta = float(X["tyre_age_delta"])
            pace_diff = float(X.get("clean_air_pace_diff", 0.0) if hasattr(X, "get") else 0.0)
            dist_bz = float(X.get("dist_to_next_heavy_braking", 999.0) if hasattr(X, "get") else 999.0)

        if math.isnan(delta_s):
            delta_s = 20.0
        if math.isnan(delta_v):
            delta_v = 0.0
        if math.isnan(drs):
            drs = 0.0
        if math.isnan(tyre_delta):
            tyre_delta = 0.0
        if math.isnan(pace_diff):
            pace_diff = 0.0
        if math.isnan(dist_bz):
            dist_bz = 999.0

        # Normalized feature impacts:
        # 1. Proximity Impact (closer is better, max impact at <= 5m)
        proximity_impact = float(np.clip(1.0 - (max(0.0, delta_s) / 25.0), -1.0, 1.0))

        # 2. Closing Speed Impact (positive delta_v is better, max at +15 km/h)
        speed_impact = float(np.clip(delta_v / 15.0, -1.0, 1.0))

        # 3. DRS Advantage
        drs_impact = 0.8 if drs > 0 else 0.0

        # 4. Tyre Freshness Delta (attacker tyre life - defender tyre life: negative is fresher attacker)
        tyre_impact = float(np.clip(-tyre_delta / 10.0, -1.0, 1.0))

        expl = {
            "proximity": round(proximity_impact, 3),
            "closing_speed": round(speed_impact, 3),
            "drs_boost": round(drs_impact, 3),
            "tyre_advantage": round(tyre_impact, 3),
        }

        # 5. Clean-Air Pace Differential (-pace_diff is positive if attacker is faster)
        if pace_diff != 0.0:
            expl["pace_advantage"] = round(float(np.clip(-pace_diff / 1.5, -1.0, 1.0)), 3)

        # 6. Heavy Braking Zone Proximity (<= 150m is hot zone)
        if dist_bz < 900.0:
            expl["braking_zone_proximity"] = round(float(np.clip(1.0 - (dist_bz / 150.0), -1.0, 1.0)), 3)

        return expl
