"""Test driver status channel lifecycle: 0 running, 1 retired, 2 not started."""

import numpy as np
import pytest
from src.web.services.frame_store import FrameStore


def test_driver_status_transitions():
    """Verify that:
    - Drivers missing before first active frame are status 2 (not started).
    - Active drivers are status 0 (running).
    - Drivers retiring (rel_dist >= 0.9999 or disappearing after active) become status 1 (retired).
    - Once retired, status remains 1 permanently for all subsequent frames.
    """
    frames = [
        # Frame 0: P1 running, P2 has not started yet (missing), P3 has not started (missing)
        {
            "t": 0.0,
            "drivers": {
                "P1": {"x": 10.0, "y": 0.0, "dist": 50.0, "speed": 100.0, "rel_dist": 0.01},
            },
        },
        # Frame 1: P1 running, P2 starts running, P3 still not started
        {
            "t": 0.04,
            "drivers": {
                "P1": {"x": 15.0, "y": 0.0, "dist": 55.0, "speed": 100.0, "rel_dist": 0.02},
                "P2": {"x": 0.0, "y": 0.0, "dist": 10.0, "speed": 50.0, "rel_dist": 0.005},
            },
        },
        # Frame 2: P1 crashes (rel_dist = 1.0), P2 running, P3 still not started
        {
            "t": 0.08,
            "drivers": {
                "P1": {"x": 15.0, "y": 0.0, "dist": 55.0, "speed": 0.0, "rel_dist": 1.0},
                "P2": {"x": 5.0, "y": 0.0, "dist": 15.0, "speed": 60.0, "rel_dist": 0.01},
            },
        },
        # Frame 3: P1 has fluctuating rel_dist (0.9990) during crash scene, P2 disappears after running (mechanical DNF)
        {
            "t": 0.12,
            "drivers": {
                "P1": {"x": 15.0, "y": 0.0, "dist": 55.0, "speed": 0.0, "rel_dist": 0.9990},
            },
        },
        # Frame 4: P1 missing, P2 missing, P3 DNS
        {
            "t": 0.16,
            "drivers": {},
        },
    ]

    driver_codes = ["P1", "P2", "P3"]
    store = FrameStore.from_frames("status_test", frames, driver_codes)
    status = store.channels["status"]

    # P1: Frame 0 running (0), Frame 1 running (0), Frame 2 retired (1), Frame 3 retired (1 - no unretire!), Frame 4 retired (1)
    assert status[0, 0] == 0
    assert status[0, 1] == 0
    assert status[0, 2] == 1
    assert status[0, 3] == 1, "P1 must not un-retire when rel_dist fluctuates"
    assert status[0, 4] == 1

    # P2: Frame 0 not started (2), Frame 1 running (0), Frame 2 running (0), Frame 3 retired (1 - disappeared), Frame 4 retired (1)
    assert status[1, 0] == 2, "P2 before start should be status 2 (not started)"
    assert status[1, 1] == 0
    assert status[1, 2] == 0
    assert status[1, 3] == 1, "P2 disappearing after running should be status 1 (retired)"
    assert status[1, 4] == 1

    # P3: Never appeared (DNS) -> status 2 for all frames
    assert list(status[2, :]) == [2, 2, 2, 2, 2], "P3 (DNS) should remain status 2 (not started) throughout"
