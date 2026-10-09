"""Verify parity between server gap calculation and legacy leaderboard logic."""

import numpy as np
from src.web.services.frame_store import FrameStore, REFERENCE_SPEED_MPS


def test_gap_parity_with_legacy_leaderboard(fixture_store: FrameStore):
    """Verify gapAhead and gapLeader exactly match the legacy LeaderboardComponent logic."""
    num_frames = fixture_store.total_frames
    num_drivers = len(fixture_store.driver_codes)

    # Sample several frames across the race
    sample_frames = [0, 50, 100, 500, 1000, 1500, 2000, 2500, num_frames - 1]

    for f_idx in sample_frames:
        dists = fixture_store.channels["dist"][:, f_idx]
        server_gap_leader = fixture_store.channels["gapLeader"][:, f_idx]
        server_gap_ahead = fixture_store.channels["gapAhead"][:, f_idx]

        # Calculate legacy leaderboard gaps
        # 1. Sort drivers by dist descending
        order = sorted(range(num_drivers), key=lambda d: (-dists[d], d))
        leader_idx = order[0]
        leader_dist = dists[leader_idx]

        for rank, drv_idx in enumerate(order):
            drv_dist = dists[drv_idx]

            # Legacy leader gap
            expected_leader_gap = (leader_dist - drv_dist) / REFERENCE_SPEED_MPS
            assert np.isclose(server_gap_leader[drv_idx], expected_leader_gap, atol=1e-4), (
                f"Frame {f_idx}: driver {fixture_store.driver_codes[drv_idx]} leader gap mismatch"
            )

            # Legacy neighbor gap (gap ahead)
            if rank == 0:
                assert np.isnan(server_gap_ahead[drv_idx]), (
                    f"Frame {f_idx}: leader {fixture_store.driver_codes[drv_idx]} should have NaN gapAhead"
                )
            else:
                ahead_idx = order[rank - 1]
                ahead_dist = dists[ahead_idx]
                expected_ahead_gap = (ahead_dist - drv_dist) / REFERENCE_SPEED_MPS
                assert np.isclose(server_gap_ahead[drv_idx], expected_ahead_gap, atol=1e-4), (
                    f"Frame {f_idx}: driver {fixture_store.driver_codes[drv_idx]} ahead gap mismatch"
                )
