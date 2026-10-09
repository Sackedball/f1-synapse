"""Binary chunk round-trip serialization and deserialization tests."""

import struct
import numpy as np
import pytest

from src.web.services.frame_store import FrameStore, parse_chunk, CHUNK_SIZE


def test_chunk_roundtrip_standard(fixture_store: FrameStore):
    """Verify chunk 0 builds and decodes exactly to source arrays with correct magic and alignment."""
    chunk_bytes = fixture_store.build_chunk(0)

    # Magic bytes check
    assert chunk_bytes[:4] == b"F1SC"

    # Header length
    header_len = struct.unpack("<I", chunk_bytes[4:8])[0]
    assert header_len > 0

    # Alignment check: data block must start at a 4-byte boundary
    data_start = (8 + header_len + 3) & ~3
    assert data_start % 4 == 0

    # Parse with reference decoder
    decoded = parse_chunk(chunk_bytes)
    assert decoded["header"]["v"] == 1
    assert decoded["header"]["i0"] == 0
    assert decoded["header"]["n"] == min(CHUNK_SIZE, fixture_store.total_frames)
    assert decoded["header"]["drivers"] == fixture_store.driver_codes

    n = decoded["header"]["n"]

    # Verify each per-driver channel matches source array
    for ch_name, arr in decoded["perDriver"].items():
        expected = fixture_store.channels[ch_name][:, :n]
        np.testing.assert_allclose(
            arr,
            expected,
            equal_nan=True,
            err_msg=f"Mismatch in channel {ch_name}",
        )

    # Verify each global channel matches source array
    for ch_name, arr in decoded["global"].items():
        expected = fixture_store.channels[ch_name][:n]
        np.testing.assert_allclose(
            arr,
            expected,
            equal_nan=True,
            err_msg=f"Mismatch in global channel {ch_name}",
        )


def test_chunk_roundtrip_partial_and_odd_size():
    """Verify chunk roundtrip with a small, odd number of frames (tests padding logic)."""
    n_odd = 73
    frames = [
        {
            "t": i * 0.04,
            "drivers": {
                "VER": {"x": 100.0 + i, "y": 200.0 - i, "dist": 500.0 + i * 10, "lap": 1, "speed": 250.0},
                "HAM": {"x": 80.0 + i, "y": 190.0 - i, "dist": 480.0 + i * 10, "lap": 1, "speed": 248.0},
            },
        }
        for i in range(n_odd)
    ]
    store = FrameStore.from_frames("odd_test", frames, ["VER", "HAM"])
    chunk_bytes = store.build_chunk(0)
    decoded = parse_chunk(chunk_bytes)

    assert decoded["header"]["n"] == n_odd
    for ch_name, arr in decoded["perDriver"].items():
        expected = store.channels[ch_name]
        np.testing.assert_allclose(arr, expected, equal_nan=True)

    for ch_name, arr in decoded["global"].items():
        expected = store.channels[ch_name]
        np.testing.assert_allclose(arr, expected, equal_nan=True)


def test_chunk_preserves_nan():
    """Verify NaN values (e.g. gapAhead for leader, unstarted car x/y) are preserved."""
    frames = [
        {
            "t": 0.0,
            "drivers": {
                "P1": {"x": 10.0, "y": 10.0, "dist": 1000.0, "lap": 1},
                "P2": {"x": np.nan, "y": np.nan, "dist": 500.0, "lap": 1},
            },
        }
    ]
    store = FrameStore.from_frames("nan_test", frames, ["P1", "P2"])
    chunk_bytes = store.build_chunk(0)
    decoded = parse_chunk(chunk_bytes)

    # Leader's gapAhead must be NaN
    assert np.isnan(decoded["perDriver"]["gapAhead"][0, 0])
    # P2's gapAhead must be a finite number
    assert not np.isnan(decoded["perDriver"]["gapAhead"][1, 0])
    # P2's x, y must be NaN
    assert np.isnan(decoded["perDriver"]["x"][1, 0])
    assert np.isnan(decoded["perDriver"]["y"][1, 0])
