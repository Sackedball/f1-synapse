"""Verify distance monotonicity per driver."""

import numpy as np
from src.web.services.frame_store import FrameStore


def test_driver_distance_is_monotonic_non_decreasing(fixture_store: FrameStore):
    """Verify cumulative race distance never decreases for any driver."""
    num_drivers = len(fixture_store.driver_codes)
    for d in range(num_drivers):
        code = fixture_store.driver_codes[d]
        dists = fixture_store.channels["dist"][d, :]
        diffs = np.diff(dists)

        # Allow slight floating point noise: diffs >= -1e-4
        min_diff = np.min(diffs)
        assert min_diff >= -1e-4, (
            f"Driver {code} dist decreased by {min_diff} at frame {np.argmin(diffs)}"
        )
