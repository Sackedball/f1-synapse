"""Race event schemas."""

from typing import Any, Dict, List, Literal, Optional
from pydantic import Field
from src.web.schemas.common import CamelModel

EventType = Literal[
    "flag",
    "safety_car",
    "vsc",
    "overtake",
    "pit_in",
    "pit_out",
    "retirement",
    "fastest_lap",
    "battle",
    "incident",
    "penalty",
    "start",
    "finish",
]

EventSeverity = Literal["info", "minor", "major"]


class RaceEvent(CamelModel):
    id: str
    type: EventType
    t: float
    t_end: Optional[float] = Field(default=None, alias="tEnd")
    lap: int
    drivers: List[str] = Field(default_factory=list)
    label: str
    severity: EventSeverity
    meta: Dict[str, Any] = Field(default_factory=dict)
