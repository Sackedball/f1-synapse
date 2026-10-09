"""TrackService: track geometry calculation and caching."""

import logging
from typing import Optional
import numpy as np
import pandas as pd

from src.web.schemas.track import TrackGeometry, TrackBounds, DrsZone, CornerInfo

logger = logging.getLogger(__name__)


def _compute_drs_zones(example_lap: pd.DataFrame) -> list[dict]:
    if "DRS" not in example_lap:
        return []
    x_val = example_lap["X"]
    y_val = example_lap["Y"]
    drs_zones = []
    drs_start = None

    for i, val in enumerate(example_lap["DRS"]):
        if val in [10, 12, 14]:
            if drs_start is None:
                drs_start = i
        else:
            if drs_start is not None:
                drs_end = i - 1
                drs_zones.append({
                    "start": {"x": float(x_val.iloc[drs_start]), "y": float(y_val.iloc[drs_start]), "index": drs_start},
                    "end": {"x": float(x_val.iloc[drs_end]), "y": float(y_val.iloc[drs_end]), "index": drs_end},
                })
                drs_start = None

    if drs_start is not None:
        drs_end = len(example_lap["DRS"]) - 1
        drs_zones.append({
            "start": {"x": float(x_val.iloc[drs_start]), "y": float(y_val.iloc[drs_start]), "index": drs_start},
            "end": {"x": float(x_val.iloc[drs_end]), "y": float(y_val.iloc[drs_end]), "index": drs_end},
        })

    return drs_zones


def build_track_geometry(
    example_lap_tel: Optional[pd.DataFrame],
    session=None,
    track_width: float = 200.0,
) -> TrackGeometry:
    """Build TrackGeometry using the pipeline's reference lap and normal-vector math."""
    if example_lap_tel is None or example_lap_tel.empty:
        # Default empty geometry if telemetry missing
        return TrackGeometry(
            centerline=[],
            inner=[],
            outer=[],
            bounds=TrackBounds(min_x=0.0, max_x=0.0, min_y=0.0, max_y=0.0),
            rotation_deg=0.0,
            finish_index=0,
            drs_zones=[],
            sectors=[],
            corners=None,
            length_m=5807.0,
        )

    drs_raw = _compute_drs_zones(example_lap_tel)
    plot_x_ref = example_lap_tel["X"]
    plot_y_ref = example_lap_tel["Y"]

    # Compute tangents and normals
    dx = np.gradient(plot_x_ref)
    dy = np.gradient(plot_y_ref)

    norm = np.sqrt(dx**2 + dy**2)
    norm[norm == 0] = 1.0
    dx /= norm
    dy /= norm

    nx = -dy
    ny = dx

    x_outer = plot_x_ref + nx * (track_width / 2)
    y_outer = plot_y_ref + ny * (track_width / 2)
    x_inner = plot_x_ref - nx * (track_width / 2)
    y_inner = plot_y_ref - ny * (track_width / 2)

    x_min = min(plot_x_ref.min(), x_inner.min(), x_outer.min())
    x_max = max(plot_x_ref.max(), x_inner.max(), x_outer.max())
    y_min = min(plot_y_ref.min(), y_inner.min(), y_outer.min())
    y_max = max(plot_y_ref.max(), y_inner.max(), y_outer.max())

    centerline = [
        (float(x), float(y))
        for x, y in zip(plot_x_ref.to_numpy(), plot_y_ref.to_numpy())
    ]
    inner = [
        (float(x), float(y))
        for x, y in zip(x_inner.to_numpy(), y_inner.to_numpy())
    ]
    outer = [
        (float(x), float(y))
        for x, y in zip(x_outer.to_numpy(), y_outer.to_numpy())
    ]

    bounds = TrackBounds(
        min_x=float(x_min),
        max_x=float(x_max),
        min_y=float(y_min),
        max_y=float(y_max),
    )

    drs_zones: list[DrsZone] = []
    for z in drs_raw:
        start_idx = int(z["start"]["index"])
        end_idx = int(z["end"]["index"])
        drs_zones.append(DrsZone(start=start_idx, end=end_idx))

    # Circuit info (rotation, corners)
    rotation_deg = 0.0
    corners: Optional[list[CornerInfo]] = None
    if session is not None:
        try:
            circuit_info = session.get_circuit_info()
            if hasattr(circuit_info, "rotation") and circuit_info.rotation is not None:
                rotation_deg = float(circuit_info.rotation)
            if hasattr(circuit_info, "corners") and circuit_info.corners is not None and not circuit_info.corners.empty:
                corners = []
                for _, r in circuit_info.corners.iterrows():
                    lbl = str(r.get("Letter", "")) if pd.notna(r.get("Letter")) else None
                    if lbl == "":
                        lbl = None
                    corners.append(
                        CornerInfo(
                            number=int(r["Number"]),
                            x=float(r["X"]),
                            y=float(r["Y"]),
                            label=lbl,
                        )
                    )
        except Exception as e:
            logger.warning("Could not extract circuit info: %s", e)

    length_m = 5807.0
    if "Distance" in example_lap_tel:
        max_dist = example_lap_tel["Distance"].max()
        if pd.notna(max_dist) and max_dist > 0:
            length_m = float(max_dist)

    return TrackGeometry(
        centerline=centerline,
        inner=inner,
        outer=outer,
        bounds=bounds,
        rotation_deg=rotation_deg,
        finish_index=0,
        drs_zones=drs_zones,
        sectors=[],
        corners=corners,
        length_m=length_m,
    )
