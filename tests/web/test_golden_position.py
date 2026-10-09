"""Golden position test: verify position is always dist-descending ranking."""

import numpy as np
import pytest

from src.web.services.frame_store import FrameStore


def test_fixture_position_equals_dist_descending_ranking(fixture_store: FrameStore):
    """Verify position channel equals exact dist-descending sort across 20 sampled frames."""
    num_frames = fixture_store.total_frames
    num_drivers = len(fixture_store.driver_codes)
    assert num_frames > 0
    assert num_drivers > 0

    sampled_indices = np.linspace(0, num_frames - 1, 20, dtype=int)

    for f_idx in sampled_indices:
        dists = fixture_store.channels["dist"][:, f_idx]
        positions = fixture_store.channels["position"][:, f_idx]

        # All positions 1..num_drivers must be unique and present
        assert set(positions.tolist()) == set(range(1, num_drivers + 1))

        # Expected ranking: sort driver indices by (-dist, driver_index)
        expected_order = sorted(
            range(num_drivers),
            key=lambda d: (-dists[d], d),
        )

        for rank, drv_idx in enumerate(expected_order, start=1):
            assert positions[drv_idx] == rank, (
                f"Frame {f_idx}: driver {fixture_store.driver_codes[drv_idx]} (dist={dists[drv_idx]}) "
                f"expected rank {rank} but got {positions[drv_idx]}"
            )


def test_synthetic_lap_counter_inversion_ranked_by_dist():
    """Verify explicitly that a car with a higher lap counter but lower dist is ranked by dist."""
    # Driver 0: Lap 5, dist 1000.0 (e.g. rounded up prematurely)
    # Driver 1: Lap 4, dist 1200.0 (traveled further on track)
    # Driver 2: Lap 4, dist 800.0
    frames = [
        {
            "t": 0.0,
            "drivers": {
                "CAR_A": {"x": 0.0, "y": 0.0, "dist": 1000.0, "lap": 5, "speed": 200.0},
                "CAR_B": {"x": 0.0, "y": 0.0, "dist": 1200.0, "lap": 4, "speed": 200.0},
                "CAR_C": {"x": 0.0, "y": 0.0, "dist": 800.0, "lap": 4, "speed": 200.0},
            },
        }
    ]
    driver_codes = ["CAR_A", "CAR_B", "CAR_C"]
    store = FrameStore.from_frames("synthetic_test", frames, driver_codes)

    pos_a = store.channels["position"][0, 0]
    pos_b = store.channels["position"][1, 0]
    pos_c = store.channels["position"][2, 0]

    # CAR_B has the largest distance (1200m), so CAR_B must be P1
    # CAR_A has 1000m, so CAR_A must be P2 despite having lap=5
    # CAR_C has 800m, so CAR_C must be P3
    assert pos_b == 1, f"CAR_B with highest dist should be P1, got {pos_b}"
    assert pos_a == 2, f"CAR_A with middle dist should be P2 despite higher lap counter, got {pos_a}"
    assert pos_c == 3, f"CAR_C with lowest dist should be P3, got {pos_c}"
