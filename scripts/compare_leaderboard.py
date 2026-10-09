"""Script to compare decoded binary chunk 0 leaderboard against legacy telemetry at t = 0, 30, 60s."""

import os
import pickle
import sys
from pathlib import Path

# Add project root to sys.path so script can run directly from any directory
ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.web.services.session_service import session_service
from src.web.services.frame_store import parse_chunk

def compare():
    sid = "2026_3_R"
    session = session_service.load_from_disk(sid)
    if session is None:
        print(f"Error: session {sid} not found on disk")
        return 1

    chunk0_bytes = session.frame_store.build_chunk(0)
    decoded = parse_chunk(chunk0_bytes)

    # Legacy source path
    legacy_pkl = "computed_data/2026_Season_Round_3:_Japanese_Grand_Prix_-_Race_race_telemetry.pkl"
    if not os.path.exists(legacy_pkl):
        print(f"Legacy pickle not found at {legacy_pkl}")
        return 1

    with open(legacy_pkl, "rb") as f:
        legacy_data = pickle.load(f)
    legacy_frames = legacy_data["frames"]

    drivers = decoded["header"]["drivers"]
    positions = decoded["perDriver"]["position"]
    dists = decoded["perDriver"]["dist"]
    gaps = decoded["perDriver"]["gapLeader"]

    print("=" * 70)
    print("LEADERBOARD COMPARISON: Web API vs Legacy Data at t = 0, 30, 60s")
    print("=" * 70)

    for t_sec, frame_idx in [(0, 0), (30, 750), (60, 1499)]:
        print(f"\n--- Time t = {t_sec}s (Frame {frame_idx}) ---")
        order_web = sorted(range(len(drivers)), key=lambda d: positions[d, frame_idx])
        web_top5 = [(drivers[d], int(positions[d, frame_idx]), float(dists[d, frame_idx]), float(gaps[d, frame_idx])) for d in order_web[:5]]

        l_frame = legacy_frames[frame_idx]
        l_sorted = sorted(l_frame["drivers"].items(), key=lambda kv: kv[1]["position"])
        leg_top5 = [(code, data["position"], data["dist"]) for code, data in l_sorted[:5]]

        print("Web API Top 5: ", [(code, f"P{pos}", f"{dist:.1f}m", f"+{gap:.3f}s") for code, pos, dist, gap in web_top5])
        print("Legacy  Top 5: ", [(code, f"P{pos}", f"{dist:.1f}m") for code, pos, dist in leg_top5])

        for rank in range(5):
            assert web_top5[rank][0] == leg_top5[rank][0], f"Mismatch at rank {rank+1}"
        print("--> EXACT MATCH!")

    print("\nParity verification PASSED with 100% agreement across all moments.")
    return 0

if __name__ == "__main__":
    sys.exit(compare())
