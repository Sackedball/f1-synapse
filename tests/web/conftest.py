"""Pytest fixtures for web API tests."""

from pathlib import Path
import pytest
import orjson

from src.web.services.frame_store import FrameStore
from src.web.services.session_service import session_service


@pytest.fixture(scope="session")
def fixture_dir() -> Path:
    return Path("web/fixtures/suzuka-2026-r3")


@pytest.fixture(scope="session")
def fixture_drivers(fixture_dir: Path) -> list[dict]:
    with open(fixture_dir / "drivers.json", "rb") as f:
        return orjson.loads(f.read())


@pytest.fixture(scope="session")
def fixture_frames(fixture_dir: Path) -> list[dict]:
    with open(fixture_dir / "frames_120s.json", "rb") as f:
        return orjson.loads(f.read())


@pytest.fixture(scope="session")
def fixture_store(fixture_dir: Path, fixture_frames: list[dict], fixture_drivers: list[dict]) -> FrameStore:
    driver_codes = [d["code"] for d in fixture_drivers]
    track_raw = orjson.loads((fixture_dir / "track.json").read_bytes())
    return FrameStore.from_frames("suzuka-2026-r3", fixture_frames, driver_codes, track=track_raw)


@pytest.fixture(scope="session", autouse=True)
def preload_fixture(fixture_dir: Path):
    """Ensure fixture session is available to session_service."""
    session_service.load_fixture(fixture_dir, sid="suzuka-2026-r3")
