"""API endpoint integration tests using httpx.AsyncClient."""

import gzip
from pathlib import Path
from unittest.mock import patch
import pandas as pd
import pytest
from httpx import ASGITransport, AsyncClient

from src.web.app import app
from src.web.config import config
from src.web.services.frame_store import parse_chunk
from src.web.services.session_service import session_service


@pytest.mark.asyncio
async def test_health_check():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://127.0.0.1:8000") as client:
        resp = await client.get("/api/health")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ok"
        assert "version" in data


@pytest.mark.asyncio
async def test_session_meta_endpoint():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://127.0.0.1:8000") as client:
        resp = await client.get("/api/sessions/suzuka-2026-r3/meta")
        assert resp.status_code == 200
        meta = resp.json()
        assert meta["sessionId"] == "suzuka-2026-r3"
        assert meta["fps"] == 25
        assert meta["chunkSize"] == 1500
        assert len(meta["drivers"]) > 0
        assert "code" in meta["drivers"][0]
        assert "color" in meta["drivers"][0]


@pytest.mark.asyncio
async def test_session_track_endpoint():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://127.0.0.1:8000") as client:
        resp = await client.get("/api/sessions/suzuka-2026-r3/track")
        assert resp.status_code == 200
        track = resp.json()
        assert "centerline" in track
        assert "inner" in track
        assert "outer" in track
        assert "bounds" in track
        assert len(track["centerline"]) > 0
        assert track["lengthM"] > 0


@pytest.mark.asyncio
async def test_chunk_0_and_last_chunk_and_etag():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://127.0.0.1:8000") as client:
        # 1. Fetch chunk 0
        resp = await client.get("/api/sessions/suzuka-2026-r3/frames/0")
        assert resp.status_code == 200
        assert resp.headers["content-type"] == "application/octet-stream"
        assert "ETag" in resp.headers
        etag = resp.headers["ETag"]
        assert "public, max-age=31536000, immutable" in resp.headers.get("cache-control", "")

        # Decode chunk 0
        decoded0 = parse_chunk(resp.content)
        assert decoded0["header"]["v"] == 1
        assert decoded0["header"]["i0"] == 0
        assert decoded0["header"]["n"] == 1500

        # 2. Test 304 with If-None-Match
        resp_304 = await client.get("/api/sessions/suzuka-2026-r3/frames/0", headers={"If-None-Match": etag})
        assert resp_304.status_code == 304

        # 3. Test Gzip encoding
        resp_gzip = await client.get("/api/sessions/suzuka-2026-r3/frames/0", headers={"Accept-Encoding": "gzip"})
        assert resp_gzip.status_code == 200
        assert resp_gzip.headers.get("content-encoding") == "gzip"
        assert resp_gzip.content == resp.content

        # 4. Fetch chunk 1 (last chunk for 3000 frames)
        resp1 = await client.get("/api/sessions/suzuka-2026-r3/frames/1")
        assert resp1.status_code == 200
        decoded1 = parse_chunk(resp1.content)
        assert decoded1["header"]["i0"] == 1500


@pytest.mark.asyncio
async def test_chunk_past_end_returns_404():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://127.0.0.1:8000") as client:
        resp = await client.get("/api/sessions/suzuka-2026-r3/frames/9999")
        assert resp.status_code == 404
        data = resp.json()
        assert "error" in data
        assert data["error"]["code"] == "chunk_out_of_bounds"


@pytest.mark.asyncio
async def test_unknown_session_returns_error_shape():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://127.0.0.1:8000") as client:
        resp = await client.get("/api/sessions/non_existent_session/meta")
        assert resp.status_code == 404
        data = resp.json()
        assert "error" in data
        assert data["error"]["code"] == "session_not_found"
        assert "message" in data["error"]


@pytest.mark.asyncio
async def test_foreign_host_header_rejected():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://127.0.0.1:8000") as client:
        resp = await client.get("/api/health", headers={"Host": "evil-domain.com"})
        assert resp.status_code == 400
        data = resp.json()
        assert "error" in data
        assert data["error"]["code"] == "invalid_host"


@pytest.mark.asyncio
async def test_empty_or_whitespace_host_header_rejected():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://127.0.0.1:8000") as client:
        resp1 = await client.get("/api/health", headers={"Host": ""})
        assert resp1.status_code == 400
        assert resp1.json()["error"]["code"] == "invalid_host"

        resp2 = await client.get("/api/health", headers={"Host": "   "})
        assert resp2.status_code == 400
        assert resp2.json()["error"]["code"] == "invalid_host"


@pytest.mark.asyncio
async def test_ml_endpoint_implemented():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://127.0.0.1:8000") as client:
        resp = await client.get("/api/sessions/suzuka-2026-r3/ml")
        assert resp.status_code == 200
        data = resp.json()
        assert "model" in data
        assert "battles" in data
        assert "pit" in data
        assert "tyre" in data
        assert data["model"]["isSynthetic"] is True
        assert "immutable" in resp.headers.get("cache-control", "").lower()


@pytest.mark.asyncio
async def test_ml_endpoint_unknown_session_returns_404_session_not_found():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://127.0.0.1:8000") as client:
        resp = await client.get("/api/sessions/completely_bogus_sid/ml")
        assert resp.status_code == 404
        data = resp.json()
        assert data["error"]["code"] == "session_not_found"


@pytest.mark.asyncio
async def test_session_laps_endpoint():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://127.0.0.1:8000") as client:
        resp = await client.get("/api/sessions/suzuka-2026-r3/laps")
        assert resp.status_code == 200
        laps = resp.json()
        assert isinstance(laps, list)
        assert len(laps) > 0
        first = laps[0]
        assert "driver" in first
        assert "lap" in first
        assert "timeSec" in first
        assert "pitIn" in first
        assert "pitOut" in first
        assert "isPB" in first
        assert "isFastest" in first


@pytest.mark.asyncio
async def test_session_stints_endpoint():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://127.0.0.1:8000") as client:
        resp = await client.get("/api/sessions/suzuka-2026-r3/stints")
        assert resp.status_code == 200
        stints = resp.json()
        assert isinstance(stints, list)
        assert len(stints) > 0
        first = stints[0]
        assert "driver" in first
        assert "stint" in first
        assert "compound" in first
        assert "lapStart" in first
        assert "lapEnd" in first


@pytest.mark.asyncio
async def test_session_race_control_endpoint():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://127.0.0.1:8000") as client:
        resp = await client.get("/api/sessions/suzuka-2026-r3/race-control")
        assert resp.status_code == 200
        rc = resp.json()
        assert isinstance(rc, list)
        assert len(rc) > 0
        first = rc[0]
        assert "t" in first
        assert "lap" in first
        assert "category" in first
        assert "message" in first


@pytest.mark.asyncio
async def test_session_weather_endpoint():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://127.0.0.1:8000") as client:
        resp = await client.get("/api/sessions/suzuka-2026-r3/weather")
        assert resp.status_code == 200
        weather = resp.json()
        assert isinstance(weather, list)
        assert len(weather) > 0
        first = weather[0]
        assert "t" in first
        assert "airTemp" in first
        assert "trackTemp" in first
        assert "humidity" in first
        assert "windSpeed" in first
        assert "rainfall" in first


@pytest.mark.asyncio
async def test_session_events_endpoint():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://127.0.0.1:8000") as client:
        resp = await client.get("/api/sessions/suzuka-2026-r3/events")
        assert resp.status_code == 200
        events = resp.json()
        assert len(events) > 0
        first = events[0]
        assert "id" in first
        assert "type" in first
        assert "t" in first
        assert "label" in first
        assert "severity" in first


@pytest.mark.asyncio
async def test_cache_status_endpoint():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://127.0.0.1:8000") as client:
        resp = await client.get("/api/cache/status?year=2026")
        assert resp.status_code == 200
        data = resp.json()
        assert "rounds" in data
        assert isinstance(data["rounds"], list)


@pytest.mark.asyncio
async def test_season_schedule_endpoint_mocked():
    mock_sched = pd.DataFrame([
        {
            "RoundNumber": 1,
            "EventName": "Bahrain Grand Prix",
            "Country": "Bahrain",
            "Location": "Sakhir",
            "EventDate": pd.Timestamp("2026-03-01"),
            "EventFormat": "conventional",
            "Session1": "Practice 1",
            "Session2": "Practice 2",
            "Session3": "Practice 3",
            "Session4": "Qualifying",
            "Session5": "Race",
        }
    ])
    with patch("fastf1.get_event_schedule", return_value=mock_sched):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://127.0.0.1:8000") as client:
            resp = await client.get("/api/seasons/2026/schedule")
            assert resp.status_code == 200
            rounds = resp.json()
            assert len(rounds) == 1
            r1 = rounds[0]
            assert r1["round"] == 1
            assert r1["name"] == "Bahrain Grand Prix"
            assert r1["country"] == "Bahrain"
            assert len(r1["sessions"]) == 5


def test_cache_mtime_invalidation():
    """Verify that is_cached_on_disk returns False when source data is newer than channels.npz."""
    sid = "2026_3_R"
    dir_path = config.web_data_dir / sid
    if not (dir_path / "channels.npz").exists():
        pytest.skip("Session 2026_3_R channels.npz not present on disk")

    # Normally it should be cached
    assert session_service.is_cached_on_disk(sid) is True

    # When source mtime is reported as future, cache must be invalidated
    with patch.object(session_service, "find_source_mtime", return_value=9999999999.0):
        assert session_service.is_cached_on_disk(sid) is False
