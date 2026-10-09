"""Health check router."""

from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(prefix="/api", tags=["health"])


class HealthResponse(BaseModel):
    status: str = "ok"
    version: str = "1.0.0"


@router.get("/health", response_model=HealthResponse)
async def health_check():
    return HealthResponse()
