"""Race control messages and weather sample schemas."""

from typing import Optional
from pydantic import Field
from src.web.schemas.common import CamelModel


class RaceControlMessage(CamelModel):
    t: float
    lap: int
    category: str
    flag: Optional[str] = None
    message: str
    drivers: Optional[list[str]] = None


class WeatherSample(CamelModel):
    t: float
    air_temp: float = Field(alias="airTemp")
    track_temp: float = Field(alias="trackTemp")
    humidity: float
    wind_speed: float = Field(alias="windSpeed")
    wind_dir: float = Field(alias="windDir")
    rainfall: bool
