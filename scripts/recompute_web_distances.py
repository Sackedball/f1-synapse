"""Recompute derived channels (dist, position, gapLeader, gapAhead) for web session caches."""

from pathlib import Path
import json
import logging
import numpy as np
from scipy.spatial import cKDTree

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("recompute")

REFERENCE_SPEED_MPS = 55.56  # 200 km/h reference speed for gap approximation

def recompute_session(session_dir: Path):
    npz_path = session_dir / "channels.npz"
    track_path = session_dir / "track.json"
    if not npz_path.exists() or not track_path.exists():
        logger.warning("Skipping %s (missing channels.npz or track.json)", session_dir.name)
        return

    logger.info("Processing session %s...", session_dir.name)
    with np.load(npz_path) as npz:
        channels = {k: npz[k].copy() for k in npz.files}

    with open(track_path, "r", encoding="utf-8") as f:
        track = json.load(f)

    centerline = np.asarray(track["centerline"], dtype=np.float32)
    ref_xs = centerline[:, 0]
    ref_ys = centerline[:, 1]
    diffs = np.sqrt(np.diff(ref_xs) ** 2 + np.diff(ref_ys) ** 2)
    ref_cumdist = np.concatenate(([0.0], np.cumsum(diffs))).astype(np.float32)
    track_len = float(ref_cumdist[-1]) if len(ref_cumdist) > 0 else 1.0
    n_track = len(ref_xs)
    tree = cKDTree(np.column_stack((ref_xs, ref_ys)))

    scale_to_meters = 0.1 if track_len > 15000.0 else 1.0
    track_len_m = track_len * scale_to_meters

    meta_path = session_dir / "meta.json"
    total_laps = 0
    if meta_path.exists():
        try:
            with open(meta_path, "r", encoding="utf-8") as f:
                meta = json.load(f)
                total_laps = int(meta.get("totalLaps") or meta.get("total_laps") or 0)
        except Exception:
            pass
    if total_laps == 0 and "lap" in channels:
        total_laps = int(np.max(channels["lap"]))

    num_drivers, num_frames = channels["x"].shape

    for d in range(num_drivers):
        pts = np.column_stack((channels["x"][d], channels["y"][d]))
        valid = ~np.isnan(pts[:, 0]) & ~np.isnan(pts[:, 1])
        if not np.any(valid):
            continue

        valid_pts = pts[valid]
        k_neighbors = min(8, n_track)
        _, cands = tree.query(valid_pts, k=k_neighbors)
        if cands.ndim == 1:
            cands = cands[:, None]

        resolved = np.empty(len(valid_pts), dtype=int)
        cur = cands[0, 0]
        resolved[0] = cur

        for i in range(1, len(valid_pts)):
            row_cands = cands[i]
            cand_diffs = (row_cands - cur + n_track) % n_track
            forward_diffs = np.where(cand_diffs > n_track // 2, cand_diffs - n_track, cand_diffs)
            valid_step = np.abs(forward_diffs) <= 60
            if np.any(valid_step):
                best_idx = np.argmin(np.abs(forward_diffs[valid_step]))
                cur = row_cands[valid_step][best_idx]
            else:
                cur = row_cands[np.argmin(np.abs(forward_diffs))]
            resolved[i] = cur

        along_track = ref_cumdist[resolved]
        along_m = along_track * scale_to_meters

        init_lap = max(int(channels["lap"][d, valid][0]), 1) if len(channels["lap"][d, valid]) > 0 else 1
        start_dist = (init_lap - 1) * track_len_m + along_m[0]

        delta = (np.diff(along_m) + track_len_m / 2.0) % track_len_m - (track_len_m / 2.0)
        steps = np.clip(delta, 0.0, 50.0)
        cum_dist = np.concatenate(([start_dist], start_dist + np.cumsum(steps)))

        # Post-race cool-down in-lap distance freeze
        if total_laps > 1:
            target_finish_dist = total_laps * track_len_m
            finish_mask = cum_dist >= target_finish_dist
            if np.any(finish_mask):
                first_finish_idx = int(np.argmax(finish_mask))
                order_epsilon = float(num_frames - first_finish_idx) * 1e-4
                cum_dist[first_finish_idx:] = target_finish_dist + order_epsilon

        channels["dist"][d, valid] = cum_dist.astype("<f4")

    # Freeze distance for retired drivers at retirement frame
    for d in range(num_drivers):
        retired_mask = channels["status"][d] == 1
        if np.any(retired_mask):
            first_ret = int(np.argmax(retired_mask))
            if first_ret > 0:
                channels["dist"][d, first_ret:] = channels["dist"][d, first_ret - 1]

    # Carry forward for retired/inactive runners
    channels["dist"] = np.maximum.accumulate(channels["dist"], axis=1).astype("<f4")

    # Check for anomalies
    diffs_all = np.diff(channels["dist"], axis=1)
    max_step = float(np.max(diffs_all))
    min_step = float(np.min(diffs_all))
    jumps_count = int(np.sum(diffs_all > 50.0))
    logger.info(
        "%s dist check: max_step=%.2fm, min_step=%.4fm, jumps_count=%d",
        session_dir.name,
        max_step,
        min_step,
        jumps_count,
    )
    assert jumps_count == 0, f"Encountered {jumps_count} distance jumps in {session_dir.name}"
    assert min_step >= 0.0, f"Distance decreased by {min_step} in {session_dir.name}"

    # Precompute position, gapLeader, gapAhead
    drv_idx_grid = np.broadcast_to(
        np.arange(num_drivers)[:, None], (num_drivers, num_frames)
    )
    order = np.lexsort((drv_idx_grid, -channels["dist"], channels["status"] != 0), axis=0)

    ranks = np.arange(1, num_drivers + 1, dtype=np.uint8)[:, None]
    np.put_along_axis(channels["position"], order, ranks, axis=0)

    leader_dist = np.take_along_axis(channels["dist"], order[0:1, :], axis=0)
    channels["gapLeader"] = ((leader_dist - channels["dist"]) / REFERENCE_SPEED_MPS).astype("<f4")

    dist_by_rank = np.take_along_axis(channels["dist"], order, axis=0)
    dist_ahead_by_rank = np.empty_like(dist_by_rank)
    dist_ahead_by_rank[0, :] = np.nan
    dist_ahead_by_rank[1:, :] = dist_by_rank[:-1, :]
    gap_ahead_by_rank = (dist_ahead_by_rank - dist_by_rank) / REFERENCE_SPEED_MPS
    np.put_along_axis(channels["gapAhead"], order, gap_ahead_by_rank, axis=0)

    # Save compressed
    np.savez_compressed(npz_path, **channels)
    logger.info("Successfully updated and saved %s", npz_path)


def main():
    web_data_dir = Path("computed_data/web")
    if not web_data_dir.exists():
        logger.error("web_data_dir %s not found", web_data_dir)
        return

    for session_dir in sorted(web_data_dir.iterdir()):
        if session_dir.is_dir():
            recompute_session(session_dir)


if __name__ == "__main__":
    main()
