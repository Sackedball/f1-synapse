"""JobManager: manages background loading jobs and Server-Sent Events."""

import asyncio
import logging
import threading
import uuid
from typing import Optional

from src.web.schemas.job import JobEvent, JobStatus, JobStage
from src.web.services.session_service import session_service

logger = logging.getLogger(__name__)


class Job:
    def __init__(self, job_id: str, session_id: str, stage: JobStage = "queued", progress: float = 0.0, message: str = "", error: Optional[str] = None):
        self.job_id = job_id
        self.session_id = session_id
        self.stage: JobStage = stage
        self.progress: float = progress
        self.message: str = message
        self.error: Optional[str] = error
        self._queues: list[asyncio.Queue] = []
        self._lock = threading.Lock()

    def to_status(self) -> JobStatus:
        with self._lock:
            return JobStatus(
                job_id=self.job_id,
                session_id=self.session_id,
                stage=self.stage,
                progress=self.progress,
                message=self.message,
                error=self.error,
            )

    def subscribe(self) -> asyncio.Queue:
        q = asyncio.Queue()
        with self._lock:
            self._queues.append(q)
            # Send current state as first event
            q.put_nowait(JobEvent(stage=self.stage, progress=self.progress, message=self.message))
        return q

    def unsubscribe(self, q: asyncio.Queue) -> None:
        with self._lock:
            if q in self._queues:
                self._queues.remove(q)

    def update(self, loop: Optional[asyncio.AbstractEventLoop], stage: JobStage, progress: float, message: str, error: Optional[str] = None) -> None:
        with self._lock:
            self.stage = stage
            self.progress = progress
            self.message = message
            self.error = error
            event = JobEvent(stage=stage, progress=progress, message=message)
            for q in list(self._queues):
                if loop and loop.is_running():
                    loop.call_soon_threadsafe(q.put_nowait, event)
                else:
                    try:
                        q.put_nowait(event)
                    except Exception:
                        pass


class JobManager:
    def __init__(self):
        self._jobs: dict[str, Job] = {}
        self._active_jobs: dict[str, Job] = {}  # sid -> Job
        self._lock = threading.Lock()
        self._loop: Optional[asyncio.AbstractEventLoop] = None

    def set_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        self._loop = loop

    def get_job(self, job_id: str) -> Optional[Job]:
        return self._jobs.get(job_id)

    def submit_load(
        self,
        year: int,
        round_num: int,
        session_type: str = "R",
        refresh: bool = False,
    ) -> Job:
        sid = session_service.session_id(year, round_num, session_type)

        with self._lock:
            # 1. Idempotency: return active job if already running for this session
            if sid in self._active_jobs:
                return self._active_jobs[sid]

            # 2. If not refreshing and already in memory
            if not refresh and session_service.get_loaded(sid) is not None:
                job_id = str(uuid.uuid4())
                job = Job(job_id=job_id, session_id=sid, stage="ready", progress=1.0, message="Session ready (loaded)")
                self._jobs[job_id] = job
                return job

            # 3. If already on disk:
            # For 2026 simulated sessions (which do not exist on live FastF1 servers) or when not refreshing, serve from disk
            if session_service.is_cached_on_disk(sid):
                if not refresh or year >= 2026:
                    if session_type in ("Q", "SQ"):
                        job_id = str(uuid.uuid4())
                        job = Job(job_id=job_id, session_id=sid, stage="ready", progress=1.0, message="Session ready (from cache)")
                        self._jobs[job_id] = job
                        return job
                    loaded = session_service.load_from_disk(sid)
                    if loaded is not None:
                        job_id = str(uuid.uuid4())
                        job = Job(job_id=job_id, session_id=sid, stage="ready", progress=1.0, message="Session ready (from cache)")
                        self._jobs[job_id] = job
                        return job

            # 4. If year == 2026 and not on disk:
            # Future 2026 races have not taken place yet and do not exist on FastF1 live timing.
            if year == 2026 and not session_service.is_cached_on_disk(sid):
                job_id = str(uuid.uuid4())
                job = Job(
                    job_id=job_id,
                    session_id=sid,
                    stage="error",
                    progress=1.0,
                    message=(
                        f"The {year} season has not taken place yet. Live telemetry cannot be downloaded from FastF1 for unrun {year} sessions. "
                        "Please select a pre-loaded 2026 demo (Round 1 Melbourne or Round 3 Suzuka), or switch to the 2024, 2023, or 2022 season tab to download any real race."
                    ),
                    error=f"Session {sid} not available online (future unrun race)",
                )
                self._jobs[job_id] = job
                return job

            # 5. Start new background job
            job_id = str(uuid.uuid4())
            job = Job(job_id=job_id, session_id=sid, stage="queued", progress=0.05, message="Job queued")
            self._jobs[job_id] = job
            self._active_jobs[sid] = job

        try:
            loop = self._loop or asyncio.get_running_loop()
        except RuntimeError:
            loop = None

        def _worker():
            try:
                def _progress_cb(stage: JobStage, progress: float, msg: str):
                    job.update(loop, stage, progress, msg)

                session_service.process_and_save_session(
                    year=year,
                    round_num=round_num,
                    session_type=session_type,
                    progress_cb=_progress_cb,
                )
            except Exception as e:
                # If downloading failed (e.g. future season or network unavailable),
                # check if a valid on-disk session cache exists to fall back to!
                if session_service.is_cached_on_disk(sid):
                    logger.warning("Live download failed for %s (%s). Falling back to disk cache.", sid, e)
                    loaded = session_service.load_from_disk(sid)
                    if loaded is not None:
                        job.update(loop, "ready", 1.0, "Session ready (loaded from cache)")
                        return

                logger.exception("Error processing session %s in background job %s: %s", sid, job_id, e)
                job.update(loop, "error", 1.0, f"Failed to load session: {e}", error=str(e))
            finally:
                with self._lock:
                    if self._active_jobs.get(sid) is job:
                        del self._active_jobs[sid]

        thread = threading.Thread(target=_worker, daemon=True, name=f"load-{sid}")
        thread.start()

        return job


job_manager = JobManager()
