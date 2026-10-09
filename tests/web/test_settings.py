"""Unit and integration tests for Settings endpoints."""

import os
import tempfile
from pathlib import Path
import pytest
from fastapi.testclient import TestClient

from src.web.app import app
from src.lib.settings import get_settings


@pytest.fixture
def client():
    return TestClient(app, base_url="http://127.0.0.1:8000")


def test_get_settings(client):
    res = client.get("/api/settings")
    assert res.status_code == 200
    data = res.json()
    assert "cacheLocation" in data
    assert "computedDataLocation" in data
    assert "cacheSizeBytes" in data
    assert "cacheSizeMb" in data
    assert isinstance(data["cacheExists"], bool)
    assert isinstance(data["dataExists"], bool)


def test_update_settings_invalid_paths(client):
    # Empty path
    res = client.put("/api/settings", json={"cacheLocation": ""})
    assert res.status_code == 400
    assert res.json()["error"]["code"] == "invalid_path"

    # Non-existent path
    non_existent = str(Path(tempfile.gettempdir()) / "non_existent_dir_987654")
    res = client.put("/api/settings", json={"cacheLocation": non_existent})
    assert res.status_code == 400
    assert res.json()["error"]["code"] == "path_not_found"

    # File path instead of directory
    with tempfile.NamedTemporaryFile() as tmp:
        res = client.put("/api/settings", json={"cacheLocation": tmp.name})
        assert res.status_code == 400
        assert res.json()["error"]["code"] == "not_a_directory"


def test_update_settings_valid_roundtrip(client):
    with tempfile.TemporaryDirectory() as tmpdir:
        res = client.put("/api/settings", json={"cacheLocation": tmpdir})
        assert res.status_code == 200
        data = res.json()
        assert Path(data["cacheLocation"]).resolve() == Path(tmpdir).resolve()

        # Check singleton updated
        mgr = get_settings()
        assert Path(mgr.cache_location).resolve() == Path(tmpdir).resolve()


def test_clear_cache(client):
    with tempfile.TemporaryDirectory() as tmpdir:
        # Create a dummy file in temp cache
        dummy_file = Path(tmpdir) / "test_cache.bin"
        dummy_file.write_bytes(b"hello cache" * 100)

        # Set settings to this dir
        client.put("/api/settings", json={"cacheLocation": tmpdir})

        # Clear cache
        res = client.post("/api/settings/cache/clear")
        assert res.status_code == 200
        data = res.json()
        assert data["filesRemoved"] >= 1
        assert data["clearedBytes"] > 0
        assert not dummy_file.exists()
