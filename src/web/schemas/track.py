"""Track geometry schemas."""

from typing import Optional
from pydantic import Field
from src.web.schemas.common import CamelModel


class TrackBounds(CamelModel):
    min_x: float = Field(alias="minX")
    min_y: float = Field(alias="minY")
    max_x: float = Field(alias="maxX")
    max_y: float = Field(alias="maxY")


class DrsZone(CamelModel):
    start: int
    end: int


class CornerInfo(CamelModel):
    number: int
    x: float
    y: float
    label: Optional[str] = None


class TrackGeometry(CamelModel):
    centerline: list[tuple[float, float]]
    inner: list[tuple[float, float]]
    outer: list[tuple[float, float]]
    bounds: TrackBounds
    rotation_deg: float = Field(default=0.0, alias="rotationDeg")
    finish_index: int = Field(default=0, alias="finishIndex")
    drs_zones: list[DrsZone] = Field(default_factory=list, alias="drsZones")
    sectors: Optional[list[int]] = None
    corners: Optional[list[CornerInfo]] = None
    length_m: float = Field(alias="lengthM")
