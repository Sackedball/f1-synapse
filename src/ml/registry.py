"""
Model registry and metadata loader for F1 Synapse ML models.
Provides cached singletons and exposes clear caveats regarding synthetic/simulated training targets.
"""

import os
from dataclasses import dataclass
from typing import Optional
import joblib


@dataclass(frozen=True)
class ModelMetadata:
    name: str
    version: str
    trained_on: str
    note: str
    is_synthetic: bool = True

    def to_dict(self) -> dict:
        return {
            "name": self.name,
            "version": self.version,
            "trainedOn": self.trained_on,
            "note": self.note,
            "isSynthetic": self.is_synthetic,
        }


DEFAULT_METADATA = ModelMetadata(
    name="F1 Synapse Hybrid Predictive Engine (LGBM + XGBoost + Bayesian State-Space)",
    version="v1.2.0",
    trained_on="Simulated telemetry & synthetic overtake/pit targets (FastF1 & Synthetic Benchmarks)",
    note=(
        "Caveat: Offline models are trained on simulated/synthetic targets due to lack of ground truth in public F1 telemetry. "
        "Probabilities represent estimated likelihoods under nominal conditions and should not be interpreted as deterministic guarantees."
    ),
    is_synthetic=True,
)


class ModelRegistry:
    """Manages loading, caching, and querying ML models."""

    _instance: Optional["ModelRegistry"] = None

    def __init__(self, models_dir: Optional[str] = None):
        if models_dir is None:
            # Root directory containing models/
            base = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
            models_dir = os.path.join(base, "models")
        self.models_dir = models_dir

        self._overtake_model = None
        self._pit_model = None
        self.metadata = DEFAULT_METADATA

    @classmethod
    def get_instance(cls) -> "ModelRegistry":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    @property
    def overtake_model(self):
        if self._overtake_model is None:
            path = os.path.join(self.models_dir, "overtake_lgbm.joblib")
            if os.path.exists(path):
                try:
                    self._overtake_model = joblib.load(path)
                except Exception as e:
                    print(f"Warning: Failed to load overtake model from {path}: {e}")
        return self._overtake_model

    @property
    def pit_model(self):
        if self._pit_model is None:
            path = os.path.join(self.models_dir, "pit_window_xgb.joblib")
            if os.path.exists(path):
                try:
                    self._pit_model = joblib.load(path)
                except Exception as e:
                    print(f"Warning: Failed to load pit model from {path}: {e}")
        return self._pit_model
