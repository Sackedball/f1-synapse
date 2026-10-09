"""
F1 Synapse Machine Learning & Predictive Analytics Module.
Pure Python, NumPy, SciPy, Pandas, LightGBM, and XGBoost.
Headless compute engine with zero GUI dependencies.
"""

from src.ml.registry import ModelRegistry, ModelMetadata
from src.ml.features import (
    extract_overtake_features,
    extract_pit_features,
    DriverTelemetryState,
    SlidingWelford,
    KinematicEngine,
)
from src.ml.overtake import OvertakeModel
from src.ml.pit import PitModel
from src.ml.tyre import TyreDegradationEstimator

__all__ = [
    "ModelRegistry",
    "ModelMetadata",
    "extract_overtake_features",
    "extract_pit_features",
    "DriverTelemetryState",
    "SlidingWelford",
    "KinematicEngine",
    "OvertakeModel",
    "PitModel",
    "TyreDegradationEstimator",
]
