"""Session metadata and load request schemas."""

from typing import Literal
from pydantic import Field
from src.web.schemas.common import CamelModel


class DriverInfo(CamelModel):
    code: str
    number: int
    full_name: str = Field(alias="fullName")
    team: str
    color: str
    index: int


class SessionMeta(CamelModel):
    session_id: str = Field(alias="sessionId")
    year: int
    round: int
    type: str
    event_name: str = Field(alias="eventName")
    circuit_name: str = Field(alias="circuitName")
    country: str
    date: str
    total_laps: int = Field(alias="totalLaps")
    total_frames: int = Field(alias="totalFrames")
    fps: int = 25
    chunk_size: int = Field(default=1500, alias="chunkSize")
    duration_sec: float = Field(alias="durationSec")
    drivers: list[DriverInfo]


class SessionLoadRequest(CamelModel):
    year: int
    round: int
    type: str = "R"
    refresh: bool = False


class SessionLoadResponse(CamelModel):
    job_id: str = Field(alias="jobId")
    session_id: str = Field(alias="sessionId")
