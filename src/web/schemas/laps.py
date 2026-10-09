"""Lap and stint schemas."""

from typing import Optional
from pydantic import Field
from src.web.schemas.common import CamelModel


class LapRow(CamelModel):
    driver: str
    lap: int
    time_sec: Optional[float] = Field(default=None, alias="timeSec")
    s1: Optional[float] = None
    s2: Optional[float] = None
    s3: Optional[float] = None
    compound: Optional[str] = None
    tyre_life: Optional[int] = Field(default=None, alias="tyreLife")
    pit_in: bool = Field(default=False, alias="pitIn")
    pit_out: bool = Field(default=False, alias="pitOut")
    is_pb: bool = Field(default=False, alias="isPB")
    is_fastest: bool = Field(default=False, alias="isFastest")


class Stint(CamelModel):
    driver: str
    stint: int
    compound: str
    lap_start: int = Field(alias="lapStart")
    lap_end: int = Field(alias="lapEnd")
