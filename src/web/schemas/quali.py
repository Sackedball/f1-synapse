"""Qualifying schemas for F1 Synapse."""

from typing import Optional
from pydantic import BaseModel, Field


class SectorTimes(BaseModel):
    """Sector split times in seconds."""

    sector1: Optional[float] = Field(default=None, description="Sector 1 time in seconds")
    sector2: Optional[float] = Field(default=None, description="Sector 2 time in seconds")
    sector3: Optional[float] = Field(default=None, description="Sector 3 time in seconds")


class QualiDriverResult(BaseModel):
    """Individual driver qualifying session classification."""

    code: str = Field(..., description="Driver 3-letter abbreviation code")
    fullName: str = Field(..., description="Driver full name")
    position: int = Field(..., description="Final qualifying position")
    color: str = Field(..., description="Team primary color in hex (e.g. #0600EF)")
    team: str = Field(..., description="Team / Constructor name")
    q1: Optional[float] = Field(default=None, description="Fastest Q1 lap time in seconds")
    q2: Optional[float] = Field(default=None, description="Fastest Q2 lap time in seconds")
    q3: Optional[float] = Field(default=None, description="Fastest Q3 lap time in seconds")
    bestLap: Optional[float] = Field(default=None, description="Fastest overall lap time across all participated segments")
    gap: Optional[float] = Field(default=None, description="Delta in seconds to pole position")
    compound: Optional[str] = Field(default=None, description="Tyre compound used on fastest lap")
    s1: Optional[float] = Field(default=None, description="Best lap Sector 1 split")
    s2: Optional[float] = Field(default=None, description="Best lap Sector 2 split")
    s3: Optional[float] = Field(default=None, description="Best lap Sector 3 split")


class QualiResultsResponse(BaseModel):
    """Full qualifying classification for a session."""

    sessionId: str = Field(..., description="Session identifier")
    eventName: str = Field(default="", description="Grand Prix event name")
    circuitName: str = Field(default="", description="Circuit / track name")
    poleLap: Optional[float] = Field(default=None, description="Pole position lap time in seconds")
    poleDriver: Optional[str] = Field(default=None, description="Pole position driver code")
    results: list[QualiDriverResult] = Field(default_factory=list, description="Driver qualifying results sorted by position")


class QualiTelemetryResponse(BaseModel):
    """Distance-resampled telemetry for driver's best lap in a qualifying segment."""

    driver: str = Field(..., description="Driver 3-letter code")
    segment: str = Field(..., description="Qualifying segment (Q1, Q2, Q3)")
    lapTime: Optional[float] = Field(default=None, description="Lap time in seconds")
    sectors: SectorTimes = Field(default_factory=SectorTimes, description="Sector splits")
    compound: Optional[str] = Field(default=None, description="Tyre compound used")
    distance: list[float] = Field(default_factory=list, description="Uniform distance grid in metres")
    speed: list[float] = Field(default_factory=list, description="Speed in km/h at each distance point")
    gear: list[int] = Field(default_factory=list, description="Gear selection at each distance point")
    throttle: list[float] = Field(default_factory=list, description="Throttle (0-100) at each distance point")
    brake: list[float] = Field(default_factory=list, description="Brake (0-100) at each distance point")
    x: list[float] = Field(default_factory=list, description="Track world X coordinates")
    y: list[float] = Field(default_factory=list, description="Track world Y coordinates")
    time: list[float] = Field(default_factory=list, description="Elapsed lap time in seconds at each distance point")
