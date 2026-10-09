"""Season schedule and cache status schemas."""

from src.web.schemas.common import CamelModel


class RoundSummary(CamelModel):
    round: int
    name: str
    country: str
    location: str
    date: str
    sessions: list[str]


class SessionCacheStatus(CamelModel):
    type: str
    cached: bool


class RoundCacheStatus(CamelModel):
    round: int
    sessions: list[SessionCacheStatus]


class CacheStatusResponse(CamelModel):
    rounds: list[RoundCacheStatus]
