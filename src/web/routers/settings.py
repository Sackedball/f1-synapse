"""Settings router for F1 Synapse."""

import logging
from fastapi import APIRouter
from src.web.schemas.settings import (
    SettingsResponse,
    SettingsUpdateRequest,
    ClearCacheResponse,
)
from src.web.services.settings_service import settings_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/settings", tags=["settings"])


@router.get("", response_model=SettingsResponse)
async def get_settings():
    """Retrieve current application storage and directory settings."""
    return settings_service.get_current_settings()


@router.put("", response_model=SettingsResponse)
async def update_settings(req: SettingsUpdateRequest):
    """Validate and update storage and directory paths."""
    return settings_service.update_settings(req)


@router.post("/cache/clear", response_model=ClearCacheResponse)
async def clear_cache():
    """Clear FastF1 cached files safely."""
    return settings_service.clear_cache()
