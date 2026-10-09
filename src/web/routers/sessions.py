"""Session data and loading router."""

import asyncio
import gzip
import logging
from pathlib import Path
from typing import Any
from fastapi import APIRouter, Header, HTTPException, Request, Response
from fastapi.responses import StreamingResponse
import orjson

from src.web.schemas import (
    SessionLoadRequest,
    SessionLoadResponse,
    SessionMeta,
    TrackGeometry,
    LapRow,
    Stint,
    RaceControlMessage,
    WeatherSample,
    JobStatus,
    RaceEvent,
    MlTimelines,
)
from src.web.jobs import job_manager
from src.web.services.session_service import session_service, LoadedSession
from src.web.services.ml_service import ml_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["sessions"])


def _get_session_or_404(sid: str) -> LoadedSession:
    # 1. Check in-memory
    loaded = session_service.get_loaded(sid)
    if loaded is not None:
        return loaded

    # 2. Check on-disk
    loaded = session_service.load_from_disk(sid)
    if loaded is not None:
        return loaded

    # 3. Check fixture fallback
    fixture_dir = Path("web/fixtures/suzuka-2026-r3")
    if (sid == "suzuka-2026-r3" or sid == "2026_3_R") and fixture_dir.exists():
        try:
            return session_service.load_fixture(fixture_dir, sid=sid)
        except Exception as e:
            logger.warning("Failed to load fixture for %s: %s", sid, e)

    raise HTTPException(
        status_code=404,
        detail={"code": "session_not_found", "message": f"Session '{sid}' is not loaded or does not exist", "detail": None},
    )


@router.post("/sessions/load", response_model=SessionLoadResponse)
async def load_session_endpoint(payload: SessionLoadRequest):
    try:
        job = job_manager.submit_load(
            year=payload.year,
            round_num=payload.round,
            session_type=payload.type,
            refresh=payload.refresh,
        )
        return SessionLoadResponse(job_id=job.job_id, session_id=job.session_id)
    except Exception as e:
        logger.error("Failed to submit session load job: %s", e)
        raise HTTPException(
            status_code=500,
            detail={"code": "job_submission_failed", "message": str(e), "detail": None},
        )


@router.get("/jobs/{job_id}", response_model=JobStatus)
async def get_job_status(job_id: str):
    job = job_manager.get_job(job_id)
    if job is None:
        raise HTTPException(
            status_code=404,
            detail={"code": "job_not_found", "message": f"Job '{job_id}' not found", "detail": None},
        )
    return job.to_status()


@router.get("/jobs/{job_id}/events")
async def get_job_events(job_id: str):
    job = job_manager.get_job(job_id)
    if job is None:
        raise HTTPException(
            status_code=404,
            detail={"code": "job_not_found", "message": f"Job '{job_id}' not found", "detail": None},
        )

    queue = job.subscribe()

    async def event_generator():
        try:
            while True:
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=30.0)
                    event_data = orjson.dumps(event.model_dump(by_alias=True)).decode("utf-8")
                    yield f"data: {event_data}\n\n"
                    if event.stage in ("ready", "error"):
                        break
                except asyncio.TimeoutError:
                    # Keep-alive comment
                    yield ": keep-alive\n\n"
        finally:
            job.unsubscribe(queue)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/sessions/{sid}/meta", response_model=SessionMeta)
async def get_session_meta(sid: str):
    session = _get_session_or_404(sid)
    return session.meta


@router.get("/sessions/{sid}/track", response_model=TrackGeometry)
async def get_session_track(sid: str):
    session = _get_session_or_404(sid)
    return session.track


@router.get("/sessions/{sid}/frames/{k}")
async def get_session_frame_chunk(
    sid: str,
    k: int,
    request: Request,
    if_none_match: str | None = Header(default=None),
):
    session = _get_session_or_404(sid)
    frame_store = session.frame_store

    if k < 0 or k >= frame_store.num_chunks:
        raise HTTPException(
            status_code=404,
            detail={"code": "chunk_out_of_bounds", "message": f"Chunk {k} does not exist (total chunks: {frame_store.num_chunks})", "detail": None},
        )

    etag = f'"{sid}-chunk-{k}"'
    if if_none_match:
        matched_tags = [x.strip() for x in if_none_match.split(",")]
        if etag in matched_tags or if_none_match.strip() == "*" or f"W/{etag}" in matched_tags:
            return Response(status_code=304, headers={"ETag": etag})

    try:
        chunk_bytes = frame_store.build_chunk(k)
    except IndexError:
        raise HTTPException(
            status_code=404,
            detail={"code": "chunk_out_of_bounds", "message": f"Chunk {k} out of bounds", "detail": None},
        )

    headers = {
        "ETag": etag,
        "Cache-Control": "public, max-age=31536000, immutable",
    }

    # Handle gzip encoding
    accept_encoding = request.headers.get("accept-encoding", "")
    if "gzip" in accept_encoding.lower():
        compressed = gzip.compress(chunk_bytes)
        headers["Content-Encoding"] = "gzip"
        return Response(content=compressed, media_type="application/octet-stream", headers=headers)

    return Response(content=chunk_bytes, media_type="application/octet-stream", headers=headers)


@router.get("/sessions/{sid}/events", response_model=list[RaceEvent])
async def get_session_events(sid: str):
    session = _get_session_or_404(sid)
    return session.events


@router.get("/sessions/{sid}/laps", response_model=list[LapRow])
async def get_session_laps(sid: str):
    session = _get_session_or_404(sid)
    return session.laps


@router.get("/sessions/{sid}/stints", response_model=list[Stint])
async def get_session_stints(sid: str):
    session = _get_session_or_404(sid)
    return session.stints


@router.get("/sessions/{sid}/race-control", response_model=list[RaceControlMessage])
async def get_session_race_control(sid: str):
    session = _get_session_or_404(sid)
    return session.race_control


@router.get("/sessions/{sid}/weather", response_model=list[WeatherSample])
async def get_session_weather(sid: str):
    session = _get_session_or_404(sid)
    return session.weather


@router.get("/sessions/{sid}/ml", response_model=MlTimelines)
async def get_session_ml(sid: str, response: Response):
    session = _get_session_or_404(sid)
    if session.ml_timelines is None:
        session.ml_timelines = ml_service.compute_ml_timelines(
            sid=sid,
            frame_store=session.frame_store,
            laps=session.laps,
            stints=session.stints,
            track=session.track,
            total_laps=session.meta.total_laps or 53,
        )
    response.headers["Cache-Control"] = "public, max-age=86400, immutable"
    return session.ml_timelines
