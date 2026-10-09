"""Season schedule and cache status router."""

import logging
from typing import Optional
from fastapi import APIRouter, HTTPException, Query
import fastf1
import pandas as pd

from src.web.schemas import (
    RoundSummary,
    CacheStatusResponse,
    RoundCacheStatus,
    SessionCacheStatus,
)
from src.web.config import config
from src.f1_data import enable_cache
from src.lib.season import get_season

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["seasons"])


@router.get("/seasons/{year}/schedule", response_model=list[RoundSummary])
async def get_season_schedule(year: int):
    try:
        enable_cache()
        sched = fastf1.get_event_schedule(year)
    except Exception as e:
        logger.error("Failed to get event schedule for year %d: %s", year, e)
        raise HTTPException(
            status_code=500,
            detail={"code": "fastf1_schedule_error", "message": f"Failed to get schedule: {e}"},
        )

    rounds: list[RoundSummary] = []
    for _, ev in sched.iterrows():
        if hasattr(ev, "is_testing") and ev.is_testing():
            continue

        sessions: list[str] = []
        for i in range(1, 6):
            s_name = ev.get(f"Session{i}")
            if s_name and pd.notna(s_name):
                sessions.append(str(s_name))

        round_num = int(ev["RoundNumber"])
        ev_name = str(ev["EventName"])
        country = str(ev.get("Country", "")) if pd.notna(ev.get("Country")) else ""
        location = str(ev.get("Location", "")) if pd.notna(ev.get("Location")) else ""
        date_str = str(ev["EventDate"].date()) if hasattr(ev.get("EventDate"), "date") else ""

        rounds.append(
            RoundSummary(
                round=round_num,
                name=ev_name,
                country=country,
                location=location,
                date=date_str,
                sessions=sessions,
            )
        )

    return rounds


@router.get("/cache/status", response_model=CacheStatusResponse)
async def get_cache_status(year: Optional[int] = Query(default=None)):
    if year is None:
        year = get_season()
    try:
        enable_cache()
        sched = fastf1.get_event_schedule(year)
    except Exception as e:
        logger.warning("Failed to get schedule for cache status: %s", e)
        return CacheStatusResponse(rounds=[])

    rounds: list[RoundCacheStatus] = []
    for _, ev in sched.iterrows():
        if hasattr(ev, "is_testing") and ev.is_testing():
            continue
        round_num = int(ev["RoundNumber"])
        format_type = str(ev.get("EventFormat", "")).lower()

        session_types = ["FP1", "SQ", "S", "Q", "R"] if "sprint" in format_type else ["FP1", "FP2", "FP3", "Q", "R"]
        sessions_status: list[SessionCacheStatus] = []

        for st in session_types:
            sid = f"{year}_{round_num}_{st}"
            web_cached = (config.web_data_dir / sid / "channels.npz").exists()
            legacy_flag = (config.computed_data_dir / f"{year}_Season_Round_{round_num}").exists()
            sessions_status.append(
                SessionCacheStatus(
                    type=st,
                    cached=bool(web_cached or legacy_flag),
                )
            )

        rounds.append(RoundCacheStatus(round=round_num, sessions=sessions_status))

    return CacheStatusResponse(rounds=rounds)
