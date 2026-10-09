"""Qualifying endpoints router."""

import logging
from fastapi import APIRouter, Query
from src.web.schemas.quali import QualiResultsResponse, QualiTelemetryResponse
from src.web.services.quali_service import quali_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/sessions", tags=["qualifying"])


@router.get("/{sid}/quali/results", response_model=QualiResultsResponse)
async def get_qualifying_results(sid: str):
    """Retrieve driver classification and lap times across qualifying segments."""
    return quali_service.get_results(sid)


@router.get("/{sid}/quali/telemetry", response_model=QualiTelemetryResponse)
async def get_qualifying_telemetry(
    sid: str,
    driver: str = Query(..., description="Driver 3-letter abbreviation code (e.g. VER)"),
    segment: str = Query("Q3", description="Qualifying segment (Q1, Q2, Q3)"),
):
    """Retrieve distance-resampled telemetry for driver's best lap in specified segment."""
    return quali_service.get_telemetry(sid=sid, driver=driver, segment=segment)
