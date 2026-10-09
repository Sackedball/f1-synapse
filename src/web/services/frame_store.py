"""FrameStore: columnar array storage and binary chunk generation."""

import logging
import math
from pathlib import Path
import struct
from typing import Any, Optional
import numpy as np
import orjson
from scipy.spatial import cKDTree

logger = logging.getLogger(__name__)

CHUNK_SIZE = 1500
FPS = 25
REFERENCE_SPEED_MPS = 55.56  # 200 km/h reference speed for gap calculations

PER_DRIVER_CHANNELS = [
    ("x", "f32", np.dtype("<f4")),
    ("y", "f32", np.dtype("<f4")),
    ("dist", "f32", np.dtype("<f4")),
    ("speed", "f32", np.dtype("<f4")),
    ("throttle", "f32", np.dtype("<f4")),
    ("brake", "f32", np.dtype("<f4")),
    ("gear", "i8", np.dtype("<i1")),
    ("drs", "u8", np.dtype("<u1")),
    ("lap", "i16", np.dtype("<i2")),
    ("tyre", "u8", np.dtype("<u1")),
    ("tyreLife", "u8", np.dtype("<u1")),
    ("position", "u8", np.dtype("<u1")),
    ("inPit", "u8", np.dtype("<u1")),
    ("status", "u8", np.dtype("<u1")),
    ("gapAhead", "f32", np.dtype("<f4")),
    ("gapLeader", "f32", np.dtype("<f4")),
]

GLOBAL_CHANNELS = [
    ("trackStatus", "u8", np.dtype("<u1")),
    ("scX", "f32", np.dtype("<f4")),
    ("scY", "f32", np.dtype("<f4")),
    ("scPhase", "u8", np.dtype("<u1")),
]


class FrameStore:
    def __init__(
        self,
        sid: str,
        driver_codes: list[str],
        channels: dict[str, np.ndarray],
        total_frames: int,
    ):
        self.sid = sid
        self.driver_codes = driver_codes
        self.channels = channels
        self.total_frames = total_frames
        self._chunk_cache: dict[int, bytes] = {}
        self._max_cache_size = 64

    @property
    def total_bytes(self) -> int:
        return sum(arr.nbytes for arr in self.channels.values())

    @property
    def num_chunks(self) -> int:
        if self.total_frames == 0:
            return 0
        return math.ceil(self.total_frames / CHUNK_SIZE)

    @classmethod
    def from_frames(
        cls,
        sid: str,
        frames: list[dict],
        driver_codes: list[str],
        track_statuses: Optional[list[dict]] = None,
        track: Optional[Any] = None,
        track_centerline: Optional[list] = None,
        total_laps: Optional[int] = None,
    ) -> "FrameStore":
        num_frames = len(frames)
        num_drivers = len(driver_codes)
        drv_map = {code: i for i, code in enumerate(driver_codes)}

        channels: dict[str, np.ndarray] = {
            "x": np.full((num_drivers, num_frames), np.nan, dtype="<f4"),
            "y": np.full((num_drivers, num_frames), np.nan, dtype="<f4"),
            "dist": np.zeros((num_drivers, num_frames), dtype="<f4"),
            "speed": np.zeros((num_drivers, num_frames), dtype="<f4"),
            "throttle": np.zeros((num_drivers, num_frames), dtype="<f4"),
            "brake": np.zeros((num_drivers, num_frames), dtype="<f4"),
            "gear": np.zeros((num_drivers, num_frames), dtype="<i1"),
            "drs": np.zeros((num_drivers, num_frames), dtype="<u1"),
            "lap": np.zeros((num_drivers, num_frames), dtype="<i2"),
            "tyre": np.full((num_drivers, num_frames), 255, dtype="<u1"),
            "tyreLife": np.zeros((num_drivers, num_frames), dtype="<u1"),
            "position": np.zeros((num_drivers, num_frames), dtype="<u1"),
            "inPit": np.zeros((num_drivers, num_frames), dtype="<u1"),
            "status": np.zeros((num_drivers, num_frames), dtype="<u1"),
            "gapAhead": np.full((num_drivers, num_frames), np.nan, dtype="<f4"),
            "gapLeader": np.zeros((num_drivers, num_frames), dtype="<f4"),
            "trackStatus": np.zeros(num_frames, dtype="<u1"),
            "scX": np.full(num_frames, np.nan, dtype="<f4"),
            "scY": np.full(num_frames, np.nan, dtype="<f4"),
            "scPhase": np.zeros(num_frames, dtype="<u1"),
        }

        # Populate raw channels from frames
        for frame_idx, frame in enumerate(frames):
            frame_drivers = frame.get("drivers", {})
            for code, p in frame_drivers.items():
                if code not in drv_map:
                    continue
                d = drv_map[code]
                channels["x"][d, frame_idx] = float(p.get("x", np.nan))
                channels["y"][d, frame_idx] = float(p.get("y", np.nan))
                channels["dist"][d, frame_idx] = float(p.get("dist", 0.0))
                channels["speed"][d, frame_idx] = float(p.get("speed", 0.0))
                channels["throttle"][d, frame_idx] = float(p.get("throttle", 0.0))
                channels["brake"][d, frame_idx] = float(p.get("brake", 0.0))
                channels["gear"][d, frame_idx] = int(p.get("gear", 0))

                # Normalize DRS: 2 = open, 1 = eligible, 0 = off
                drs_raw = int(p.get("drs", 0))
                if drs_raw in (10, 12, 14, 2) or (drs_raw & 2 != 0 and drs_raw > 1):
                    channels["drs"][d, frame_idx] = 2
                elif drs_raw in (8, 1) or (drs_raw & 8 != 0):
                    channels["drs"][d, frame_idx] = 1
                else:
                    channels["drs"][d, frame_idx] = 0

                channels["lap"][d, frame_idx] = int(p.get("lap", 1))

                # Normalize tyre: 0 S, 1 M, 2 H, 3 I, 4 W, 255 unknown
                t_val = p.get("tyre", 255)
                try:
                    t_int = int(round(float(t_val)))
                    channels["tyre"][d, frame_idx] = t_int if 0 <= t_int <= 4 else 255
                except (ValueError, TypeError):
                    channels["tyre"][d, frame_idx] = 255

                channels["tyreLife"][d, frame_idx] = max(0, min(255, int(p.get("tyre_life", 0))))
                channels["inPit"][d, frame_idx] = 1 if p.get("in_pit") else 0

            # Safety car
            sc = frame.get("safety_car")
            if sc and isinstance(sc, dict):
                channels["scX"][frame_idx] = float(sc.get("x", np.nan))
                channels["scY"][frame_idx] = float(sc.get("y", np.nan))
                phase = sc.get("phase")
                if phase == "deploying":
                    channels["scPhase"][frame_idx] = 1
                elif phase == "on_track":
                    channels["scPhase"][frame_idx] = 2
                elif phase == "returning":
                    channels["scPhase"][frame_idx] = 3
                else:
                    channels["scPhase"][frame_idx] = 0

        # Determine max lap in session if total_laps is not explicitly provided
        max_lap_in_session = total_laps if total_laps is not None and total_laps > 0 else 0
        if max_lap_in_session == 0 and num_frames > 0:
            for f in frames:
                f_drvs = f.get("drivers", {})
                for p in f_drvs.values():
                    l_val = int(p.get("lap", 1))
                    if l_val > max_lap_in_session:
                        max_lap_in_session = l_val

        # Compute status per driver: 0 running, 1 retired/out, 2 not started
        for d in range(num_drivers):
            code = driver_codes[d]

            # Find first, last seen, and last actively moving frame
            first_seen = -1
            last_seen = -1
            last_active = -1

            for f_idx in range(num_frames):
                frame_drv = frames[f_idx].get("drivers", {})
                if code in frame_drv:
                    if first_seen == -1:
                        first_seen = f_idx
                    last_seen = f_idx
                    spd = float(frame_drv[code].get("speed", 0.0))
                    in_pit = bool(frame_drv[code].get("in_pit"))
                    if spd > 10.0 or in_pit:
                        last_active = f_idx

            if first_seen == -1:
                # Driver never appeared (DNS)
                channels["status"][d, :] = 2
                continue

            # Determine retirement frame (if any)
            retired_frame = None
            if last_seen < num_frames - 1:
                retired_frame = last_seen + 1

            # Check for crash / stoppage where driver stopped and never drove actively again
            for f_idx in range(first_seen, num_frames):
                frame_drv = frames[f_idx].get("drivers", {})
                if code in frame_drv:
                    p = frame_drv[code]
                    rel_dist = float(p.get("rel_dist", 0.0))
                    speed = float(p.get("speed", 0.0))
                    in_pit = bool(p.get("in_pit"))
                    drv_lap = int(p.get("lap", 1))

                    is_mid_race_stop = (
                        f_idx > last_active
                        and speed == 0.0
                        and not in_pit
                        and (drv_lap < max_lap_in_session if max_lap_in_session > 1 else True)
                        and (num_frames - last_active > 30 * FPS or num_frames < 100)
                    )
                    if (rel_dist >= 0.9999 and speed == 0.0 and not in_pit and f_idx > last_active) or is_mid_race_stop:
                        if retired_frame is None or f_idx < retired_frame:
                            retired_frame = f_idx
                            break

            for f_idx in range(num_frames):
                if f_idx < first_seen:
                    channels["status"][d, f_idx] = 2  # not started yet
                elif retired_frame is not None and f_idx >= retired_frame:
                    channels["status"][d, f_idx] = 1  # retired / out
                else:
                    channels["status"][d, f_idx] = 0  # actively running

        # Track status
        # Raw codes: '1'=green(0), '2'=yellow(1), '4'=SC(2), '5'=red(3), '6'/'7'=VSC(4/5)
        raw_to_norm = {"1": 0, "2": 1, "4": 2, "5": 3, "6": 4, "7": 5}
        if track_statuses:
            for st in track_statuses:
                start_t = float(st.get("start_time", 0.0))
                end_t = float(st.get("end_time") or 1e9)
                status_code = str(st.get("status", "1"))
                norm_status = raw_to_norm.get(status_code, 0)

                i_start = max(0, int(round(start_t * FPS)))
                i_end = min(num_frames, int(round(end_t * FPS)))
                if i_start < i_end:
                    channels["trackStatus"][i_start:i_end] = norm_status

        # Resolve centerline from track argument if provided
        centerline = track_centerline
        if centerline is None and track is not None:
            if hasattr(track, "centerline"):
                centerline = track.centerline
            elif isinstance(track, dict) and "centerline" in track:
                centerline = track["centerline"]

        # Compute authoritative along-track cumulative distance if centerline is available
        if centerline is not None and len(centerline) >= 2 and num_drivers > 0 and num_frames > 0:
            try:
                centerline_arr = np.asarray(centerline, dtype=np.float32)
                ref_xs = centerline_arr[:, 0]
                ref_ys = centerline_arr[:, 1]
                diffs = np.sqrt(np.diff(ref_xs)**2 + np.diff(ref_ys)**2)
                ref_cumdist = np.concatenate(([0.0], np.cumsum(diffs))).astype(np.float32)
                track_len = float(ref_cumdist[-1]) if len(ref_cumdist) > 0 else 1.0
                n_track = len(ref_xs)
                tree = cKDTree(np.column_stack((ref_xs, ref_ys)))

                # Raw FastF1 coordinates are in decimeters (1/10m), so track_len > 15000 indicates decimeters.
                scale_to_meters = 0.1 if track_len > 15000.0 else 1.0

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
                    track_len_m = track_len * scale_to_meters

                    init_lap = max(int(channels["lap"][d, valid][0]), 1) if len(channels["lap"][d, valid]) > 0 else 1
                    start_dist = (init_lap - 1) * track_len_m + along_m[0]

                    delta = (np.diff(along_m) + track_len_m / 2.0) % track_len_m - (track_len_m / 2.0)
                    steps = np.clip(delta, 0.0, 50.0)
                    cum_dist = np.concatenate(([start_dist], start_dist + np.cumsum(steps)))

                    # Post-race cool-down in-lap distance freeze:
                    # Once a driver completes scheduled race distance (total_laps * track_len_m),
                    # clamp their distance to freeze their finishing position so cool-down laps
                    # cannot overtake finishers.
                    if max_lap_in_session > 1:
                        target_finish_dist = max_lap_in_session * track_len_m
                        finish_mask = cum_dist >= target_finish_dist
                        if np.any(finish_mask):
                            first_finish_idx = int(np.argmax(finish_mask))
                            order_epsilon = float(num_frames - first_finish_idx) * 1e-4
                            cum_dist[first_finish_idx:] = target_finish_dist + order_epsilon

                    channels["dist"][d, valid] = cum_dist.astype("<f4")
            except Exception as e:
                logger.warning("Failed to compute along-track distances from centerline: %s", e)

        # Freeze distance for retired drivers at retirement frame
        for d in range(num_drivers):
            retired_mask = channels["status"][d] == 1
            if np.any(retired_mask):
                first_ret = int(np.argmax(retired_mask))
                if first_ret > 0:
                    channels["dist"][d, first_ret:] = channels["dist"][d, first_ret - 1]

        # Ensure cumulative distance is strictly monotonic non-decreasing (removes GPS/interpolation jitter)
        if num_drivers > 0 and num_frames > 0:
            channels["dist"] = np.maximum.accumulate(channels["dist"], axis=1).astype("<f4")

        # VECTORIZED PRECOMPUTATION:
        # 1. Position: rank active runners (status 0) before retired (status 1) before DNS (status 2).
        # Within each category, sort by cumulative dist descending, ties broken deterministically by driver index.
        if num_drivers > 0 and num_frames > 0:
            drv_idx_grid = np.broadcast_to(
                np.arange(num_drivers)[:, None], (num_drivers, num_frames)
            )
            order = np.lexsort((drv_idx_grid, -channels["dist"], channels["status"] != 0), axis=0)

            ranks = np.arange(1, num_drivers + 1, dtype=np.uint8)[:, None]
            np.put_along_axis(channels["position"], order, ranks, axis=0)

            # 2. Leader gap: seconds to leader = (leader_dist - dist) / 55.56
            leader_dist = np.take_along_axis(channels["dist"], order[0:1, :], axis=0)
            channels["gapLeader"] = (leader_dist - channels["dist"]) / REFERENCE_SPEED_MPS

            # 3. Ahead gap: seconds to car ahead = (dist_ahead - dist) / 55.56 (NaN for leader)
            dist_by_rank = np.take_along_axis(channels["dist"], order, axis=0)
            dist_ahead_by_rank = np.empty_like(dist_by_rank)
            dist_ahead_by_rank[0, :] = np.nan
            dist_ahead_by_rank[1:, :] = dist_by_rank[:-1, :]
            gap_ahead_by_rank = (dist_ahead_by_rank - dist_by_rank) / REFERENCE_SPEED_MPS
            np.put_along_axis(channels["gapAhead"], order, gap_ahead_by_rank, axis=0)

        store = cls(sid, driver_codes, channels, num_frames)
        logger.info(
            "FrameStore created for session %s: %d frames, %d drivers, %.2f MB",
            sid,
            num_frames,
            num_drivers,
            store.total_bytes / (1024 * 1024),
        )
        return store

    def save(self, dir_path: Path) -> None:
        dir_path.mkdir(parents=True, exist_ok=True)
        npz_path = dir_path / "channels.npz"
        meta_path = dir_path / "store_meta.json"
        np.savez_compressed(npz_path, **self.channels)
        with open(meta_path, "wb") as f:
            f.write(
                orjson.dumps(
                    {
                        "sid": self.sid,
                        "driver_codes": self.driver_codes,
                        "total_frames": self.total_frames,
                        "version": 2,
                    }
                )
            )
        logger.info("Saved FrameStore to %s (%.2f MB)", npz_path, npz_path.stat().st_size / (1024 * 1024))

    @classmethod
    def load(cls, dir_path: Path) -> Optional["FrameStore"]:
        npz_path = dir_path / "channels.npz"
        meta_path = dir_path / "store_meta.json"
        if not npz_path.exists() or not meta_path.exists():
            return None
        with open(meta_path, "rb") as f:
            meta = orjson.loads(f.read())
        with np.load(npz_path) as npz:
            channels = {k: npz[k] for k in npz.files}
        store = cls(
            sid=meta["sid"],
            driver_codes=meta["driver_codes"],
            channels=channels,
            total_frames=meta["total_frames"],
        )
        logger.info(
            "Loaded FrameStore for %s: %d frames, %.2f MB in memory",
            store.sid,
            store.total_frames,
            store.total_bytes / (1024 * 1024),
        )
        return store

    def build_chunk(self, k: int) -> bytes:
        if k < 0:
            raise IndexError(f"Chunk index {k} out of bounds")
        i0 = k * CHUNK_SIZE
        if self.total_frames == 0 or i0 >= self.total_frames:
            raise IndexError(f"Chunk index {k} exceeds total frames {self.total_frames}")

        if k in self._chunk_cache:
            return self._chunk_cache[k]

        i1 = min((k + 1) * CHUNK_SIZE, self.total_frames)
        n = i1 - i0
        num_drivers = len(self.driver_codes)

        header_obj = {
            "v": 1,
            "i0": int(i0),
            "n": int(n),
            "fps": FPS,
            "drivers": self.driver_codes,
            "perDriver": [
                {"name": name, "dtype": dtype_str}
                for name, dtype_str, _ in PER_DRIVER_CHANNELS
            ],
            "global": [
                {"name": name, "dtype": dtype_str}
                for name, dtype_str, _ in GLOBAL_CHANNELS
            ],
        }

        header_bytes = orjson.dumps(header_obj)
        header_len = len(header_bytes)

        buf = bytearray(b"F1SC")
        buf += struct.pack("<I", header_len)
        buf += header_bytes

        # Align to 4-byte boundary before data blocks
        pad = (4 - (len(buf) % 4)) % 4
        buf += b"\x00" * pad

        # Write per-driver channels
        for name, _, dt in PER_DRIVER_CHANNELS:
            arr = self.channels[name]
            for d in range(num_drivers):
                pad = (4 - (len(buf) % 4)) % 4
                buf += b"\x00" * pad
                buf += arr[d, i0:i1].astype(dt).tobytes()

        # Write global channels
        for name, _, dt in GLOBAL_CHANNELS:
            arr = self.channels[name]
            pad = (4 - (len(buf) % 4)) % 4
            buf += b"\x00" * pad
            buf += arr[i0:i1].astype(dt).tobytes()

        chunk_bytes = bytes(buf)

        if len(self._chunk_cache) >= self._max_cache_size:
            # Simple eviction
            self._chunk_cache.pop(next(iter(self._chunk_cache)))
        self._chunk_cache[k] = chunk_bytes

        return chunk_bytes


def parse_chunk(data: bytes) -> dict:
    """Python reference decoder for binary chunks."""
    if len(data) < 8 or data[:4] != b"F1SC":
        raise ValueError("Invalid magic bytes, expected F1SC")
    header_len = struct.unpack("<I", data[4:8])[0]
    header_bytes = data[8 : 8 + header_len]
    header = orjson.loads(header_bytes)

    offset = 8 + header_len
    offset = (offset + 3) & ~3

    n = header["n"]
    drivers = header["drivers"]
    num_drivers = len(drivers)

    dtype_map = {
        "f32": np.dtype("<f4"),
        "i8": np.dtype("<i1"),
        "u8": np.dtype("<u1"),
        "i16": np.dtype("<i2"),
    }

    per_driver = {}
    for ch in header["perDriver"]:
        name = ch["name"]
        dt = dtype_map[ch["dtype"]]
        arr = np.empty((num_drivers, n), dtype=dt)
        for d in range(num_drivers):
            offset = (offset + 3) & ~3
            count_bytes = n * dt.itemsize
            arr[d] = np.frombuffer(data, dtype=dt, count=n, offset=offset)
            offset += count_bytes
        per_driver[name] = arr

    glob = {}
    for ch in header["global"]:
        name = ch["name"]
        dt = dtype_map[ch["dtype"]]
        offset = (offset + 3) & ~3
        count_bytes = n * dt.itemsize
        glob[name] = np.frombuffer(data, dtype=dt, count=n, offset=offset)
        offset += count_bytes

    return {
        "header": header,
        "perDriver": per_driver,
        "global": glob,
    }
