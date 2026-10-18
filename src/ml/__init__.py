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
from src.ml.mining import (
    FastF1DatasetMiner,
    standardize_laps_dataframe,
    mine_overtake_dataset_from_channels,
    mine_pit_dataset_from_laps,
    save_dataset,
    generate_mock_overtake_dataset,
    generate_mock_pit_dataset,
)

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
    "FastF1DatasetMiner",
    "standardize_laps_dataframe",
    "mine_overtake_dataset_from_channels",
    "mine_pit_dataset_from_laps",
    "save_dataset",
    "generate_mock_overtake_dataset",
    "generate_mock_pit_dataset",
]
