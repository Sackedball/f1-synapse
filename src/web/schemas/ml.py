"""
Pydantic schemas for Machine Learning predictive timelines and explainability.
"""

from typing import Dict, List, Optional
from pydantic import Field
from src.web.schemas.common import CamelModel


class MlModelMetadata(CamelModel):
    name: str
    version: str
    trained_on: str = Field(alias="trainedOn")
    note: str
    is_synthetic: bool = Field(default=True, alias="isSynthetic")


class MlBattleSegment(CamelModel):
    attacker: str
    defender: str
    t0: float
    dt: float
    probabilities: List[float]
    gap_meters: Optional[List[float]] = Field(default=None, alias="gapMeters")
    closing_speed_kmh: Optional[List[float]] = Field(default=None, alias="closingSpeedKmh")
    contributions: Optional[Dict[str, float]] = None


class MlDriverPitTimeline(CamelModel):
    driver: str
    t0: float
    dt: float
    probabilities: List[float]


class MlDriverTyreTimeline(CamelModel):
    driver: str
    laps: List[int]
    degradation_s_per_lap: List[float] = Field(alias="degradationSPerLap")
    pace_loss_s: List[float] = Field(alias="paceLossS")
    projected_degradation: List[float] = Field(alias="projectedDegradation")


class MlTimelines(CamelModel):
    session_id: str = Field(alias="sessionId")
    model: MlModelMetadata
    battles: List[MlBattleSegment]
    pit: Dict[str, MlDriverPitTimeline]
    tyre: Dict[str, MlDriverTyreTimeline]
