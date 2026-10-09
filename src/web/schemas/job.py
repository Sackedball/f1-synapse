"""Job status and event schemas."""

from typing import Literal, Optional
from pydantic import Field
from src.web.schemas.common import CamelModel

JobStage = Literal[
    "queued",
    "downloading",
    "processing_drivers",
    "resampling",
    "indexing_events",
    "computing_ml",
    "ready",
    "error",
]


class JobEvent(CamelModel):
    stage: JobStage
    progress: float
    message: str


class JobStatus(CamelModel):
    job_id: str = Field(alias="jobId")
    session_id: str = Field(alias="sessionId")
    stage: JobStage
    progress: float
    message: str
    error: Optional[str] = None
