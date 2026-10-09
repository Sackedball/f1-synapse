"""Unit and integration tests for Qualifying endpoints."""

import pytest
from fastapi.testclient import TestClient

from src.web.app import app


@pytest.fixture
def client():
    return TestClient(app, base_url="http://127.0.0.1:8000")


def test_get_quali_results(client):
    res = client.get("/api/sessions/suzuka-2026-r3/quali/results")
    assert res.status_code == 200
    data = res.json()
    assert data["sessionId"] == "suzuka-2026-r3"
    assert data["poleDriver"] == "VER"
    assert data["poleLap"] == pytest.approx(88.197, rel=1e-3)

    results = data["results"]
    assert len(results) == 20
    # Pos 1 is VER
    assert results[0]["code"] == "VER"
    assert results[0]["position"] == 1
    assert results[0]["gap"] == 0.0

    # Pos 2 is PER
    assert results[1]["code"] == "PER"
    assert results[1]["position"] == 2
    assert results[1]["gap"] > 0

    # Elimination checking: P16 (ZHO) has Q1, but Q2 and Q3 are None
    zho = next(r for r in results if r["code"] == "ZHO")
    assert zho["q1"] is not None
    assert zho["q2"] is None
    assert zho["q3"] is None


def test_get_quali_telemetry_shape_and_monotonic(client):
    res = client.get("/api/sessions/suzuka-2026-r3/quali/telemetry?driver=VER&segment=Q3")
    assert res.status_code == 200
    data = res.json()
    assert data["driver"] == "VER"
    assert data["segment"] == "Q3"
    assert data["lapTime"] == pytest.approx(88.197, rel=1e-3)
    assert data["compound"] == "SOFT"

    dist = data["distance"]
    speed = data["speed"]
    gear = data["gear"]
    throttle = data["throttle"]
    brake = data["brake"]
    x = data["x"]
    y = data["y"]
    t = data["time"]

    n = len(dist)
    assert n > 100
    assert len(speed) == n
    assert len(gear) == n
    assert len(throttle) == n
    assert len(brake) == n
    assert len(x) == n
    assert len(y) == n
    assert len(t) == n

    # Distance must be strictly non-decreasing (monotonic)
    for i in range(1, n):
        assert dist[i] >= dist[i - 1], f"Distance non-monotonic at index {i}"

    # Time must also be strictly monotonic
    for i in range(1, n):
        assert t[i] >= t[i - 1], f"Time non-monotonic at index {i}"


def test_quali_telemetry_driver_comparison_grid_alignment(client):
    res_ver = client.get("/api/sessions/suzuka-2026-r3/quali/telemetry?driver=VER&segment=Q3")
    res_nor = client.get("/api/sessions/suzuka-2026-r3/quali/telemetry?driver=NOR&segment=Q3")
    assert res_ver.status_code == 200
    assert res_nor.status_code == 200

    ver_data = res_ver.json()
    nor_data = res_nor.json()

    # Both drivers must have identical distance grids so deltas can be computed
    assert ver_data["distance"] == nor_data["distance"]

    # Norris lap time should be slightly slower than Verstappen
    assert nor_data["lapTime"] > ver_data["lapTime"]


def test_quali_telemetry_errors(client):
    # Invalid segment
    res = client.get("/api/sessions/suzuka-2026-r3/quali/telemetry?driver=VER&segment=Q4")
    assert res.status_code == 400
    assert res.json()["error"]["code"] == "invalid_segment"

    # Missing driver
    res = client.get("/api/sessions/suzuka-2026-r3/quali/telemetry?driver=NONEXISTENT&segment=Q3")
    assert res.status_code == 404

    # Driver eliminated prior to segment (ZHO in Q3)
    res = client.get("/api/sessions/suzuka-2026-r3/quali/telemetry?driver=ZHO&segment=Q3")
    assert res.status_code == 404
    assert res.json()["error"]["code"] == "driver_not_in_segment"
