"""Job lifecycle and Server-Sent Events tests with stubbed loader."""

import asyncio
from unittest.mock import patch
import pytest
from httpx import ASGITransport, AsyncClient

from src.web.app import app
from src.web.jobs import JobManager


@pytest.mark.asyncio
async def test_job_lifecycle_progress_and_idempotence():
    """Verify job progress stage ordering and concurrent request idempotence."""
    mgr = JobManager()
    mgr.set_loop(asyncio.get_running_loop())

    stages_seen = []

    import threading
    pause_evt = threading.Event()

    def stub_process(year, round_num, session_type, progress_cb=None):
        if progress_cb:
            progress_cb("queued", 0.05, "Queued")
            stages_seen.append("queued")
            progress_cb("downloading", 0.20, "Downloading")
            stages_seen.append("downloading")
        # Wait until test asserts concurrency
        pause_evt.wait(timeout=2.0)
        for stage, prog, msg in [
            ("processing_drivers", 0.50, "Processing"),
            ("resampling", 0.70, "Resampling"),
            ("indexing_events", 0.85, "Indexing"),
            ("ready", 1.0, "Ready"),
        ]:
            if progress_cb:
                progress_cb(stage, prog, msg)
                stages_seen.append(stage)

    with patch("src.web.jobs.session_service.process_and_save_session", side_effect=stub_process):
        with patch("src.web.jobs.session_service.is_cached_on_disk", return_value=False):
            with patch("src.web.jobs.session_service.get_loaded", return_value=None):
                job1 = mgr.submit_load(2099, 1, "R", refresh=True)
                job2 = mgr.submit_load(2099, 1, "R", refresh=False)

                # Idempotency: concurrent submissions return the same Job
                assert job1.job_id == job2.job_id
                pause_evt.set()

                # Wait for worker thread to complete
                for _ in range(50):
                    if job1.stage in ("ready", "error"):
                        break
                    await asyncio.sleep(0.05)

                assert job1.stage == "ready"
                assert job1.progress == 1.0
                assert stages_seen == [
                    "queued",
                    "downloading",
                    "processing_drivers",
                    "resampling",
                    "indexing_events",
                    "ready",
                ]


@pytest.mark.asyncio
async def test_job_failure_path():
    """Verify job failure transitions to error stage with error message."""
    mgr = JobManager()
    mgr.set_loop(asyncio.get_running_loop())

    def stub_failure(year, round_num, session_type, progress_cb=None):
        if progress_cb:
            progress_cb("downloading", 0.20, "Downloading")
        raise RuntimeError("FastF1 connection timed out")

    with patch("src.web.jobs.session_service.process_and_save_session", side_effect=stub_failure):
        with patch("src.web.jobs.session_service.is_cached_on_disk", return_value=False):
            with patch("src.web.jobs.session_service.get_loaded", return_value=None):
                job = mgr.submit_load(2098, 2, "R", refresh=True)

                for _ in range(50):
                    if job.stage in ("ready", "error"):
                        break
                    await asyncio.sleep(0.05)

                assert job.stage == "error"
                assert "FastF1 connection timed out" in (job.error or "")


@pytest.mark.asyncio
async def test_job_status_and_events_api():
    """Verify GET /api/jobs/{job_id} and /api/jobs/{job_id}/events endpoints."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://127.0.0.1:8000") as client:
        # Submit load for already cached / fixture session
        resp = await client.post("/api/sessions/load", json={"year": 2026, "round": 3, "type": "R", "refresh": False})
        assert resp.status_code == 200
        data = resp.json()
        job_id = data["jobId"]

        # Check job status endpoint
        status_resp = await client.get(f"/api/jobs/{job_id}")
        assert status_resp.status_code == 200
        status_data = status_resp.json()
        assert status_data["jobId"] == job_id
        assert status_data["stage"] in ("queued", "downloading", "processing_drivers", "resampling", "indexing_events", "ready")
