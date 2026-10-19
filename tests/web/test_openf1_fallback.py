"""Unit tests for the OpenF1 fallback mechanism in session_service."""

from unittest.mock import MagicMock, patch
import pytest

from src.web.services.session_service import session_service, LoadedSession
from src.web.schemas import DriverInfo, SessionMeta, TrackGeometry, TrackBounds
from src.web.services.frame_store import FrameStore


def test_openf1_session_key_resolution():
    """Verify OpenF1 session_key resolver handles mapping properly."""
    from src.openf1_data import get_openf1_session_key

    mock_sessions = [
        {"session_key": 1001, "session_name": "Race", "date_start": "2024-03-02T15:00:00Z", "country_name": "Bahrain"},
        {"session_key": 1002, "session_name": "Race", "date_start": "2024-03-09T15:00:00Z", "country_name": "Saudi Arabia"},
    ]

    with patch("src.openf1_data._safe_get", return_value=mock_sessions):
        # Round 1
        res1 = get_openf1_session_key(2024, 1, "R")
        assert res1 is not None
        assert res1["session_key"] == 1001

        # Round 2
        res2 = get_openf1_session_key(2024, 2, "R")
        assert res2 is not None
        assert res2["session_key"] == 1002

        # Non-existent round
        res_none = get_openf1_session_key(2024, 99, "R")
        assert res_none is None


def test_openf1_fallback_triggered_on_fastf1_failure(tmp_path):
    """When FastF1 fails (e.g. 401 error or empty data), session_service must fall back to OpenF1."""
    # Ensure fresh state
    sid = "2024_99_R"

    mock_loaded = MagicMock(spec=LoadedSession)
    mock_loaded.meta = MagicMock(spec=SessionMeta)
    mock_loaded.meta.session_id = sid

    with patch("src.web.services.session_service.load_session", side_effect=ValueError("401 Unauthorized Live Timing Lockout")), \
         patch.object(session_service, "_process_and_save_openf1", return_value=mock_loaded) as mock_openf1:

        progress_msgs = []
        def on_progress(stage, pct, msg):
            progress_msgs.append((stage, msg))

        result = session_service.process_and_save_session(
            year=2024,
            round_num=99,
            session_type="R",
            progress_cb=on_progress,
        )

        # Verified that OpenF1 fallback was called
        mock_openf1.assert_called_once_with(
            year=2024,
            round_num=99,
            session_type="R",
            progress_cb=on_progress,
        )
        assert result == mock_loaded
        # Verified progress notification told user about fallback
        assert any("Falling back to OpenF1" in msg for _, msg in progress_msgs)


def test_openf1_fallback_triggered_on_empty_laps(tmp_path):
    """When FastF1 loads but returns empty laps, OpenF1 fallback must be triggered."""
    mock_fastf1_session = MagicMock()
    mock_fastf1_session._laps = MagicMock()
    mock_fastf1_session.laps.empty = True

    mock_loaded = MagicMock(spec=LoadedSession)

    with patch("src.web.services.session_service.load_session", return_value=mock_fastf1_session), \
         patch.object(session_service, "_process_and_save_openf1", return_value=mock_loaded) as mock_openf1:

        result = session_service.process_and_save_session(
            year=2024,
            round_num=99,
            session_type="R",
        )
        mock_openf1.assert_called_once()
        assert result == mock_loaded
