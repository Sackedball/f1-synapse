"""Settings schemas for F1 Synapse."""

from typing import Optional
from pydantic import BaseModel, Field


class SettingsResponse(BaseModel):
    """Current application storage settings and stats."""

    cacheLocation: str = Field(..., description="Path to FastF1 cache directory")
    computedDataLocation: str = Field(..., description="Path to computed data directory")
    cacheSizeBytes: int = Field(default=0, description="Total FastF1 cache size in bytes")
    cacheSizeMb: float = Field(default=0.0, description="Total FastF1 cache size in megabytes")
    cacheExists: bool = Field(default=True, description="Whether cache directory exists")
    dataExists: bool = Field(default=True, description="Whether computed data directory exists")


class SettingsUpdateRequest(BaseModel):
    """Payload to update directory settings."""

    cacheLocation: Optional[str] = Field(default=None, description="New FastF1 cache directory")
    computedDataLocation: Optional[str] = Field(default=None, description="New computed data directory")


class ClearCacheResponse(BaseModel):
    """Response after clearing FastF1 cache."""

    clearedBytes: int = Field(..., description="Bytes cleared from cache")
    filesRemoved: int = Field(..., description="Number of files removed")
    message: str = Field(..., description="Status message")
