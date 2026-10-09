"""Qualifying service wrapping FastF1 qualifying pipeline with fixture fallback."""

import json
import logging
from pathlib import Path
from typing import Optional

from fastapi import HTTPException
import numpy as np

from src.web.config import config
from src.web.schemas.quali import (
    SectorTimes,
    QualiDriverResult,
    QualiResultsResponse,
    QualiTelemetryResponse,
)
from src.web.services.session_service import session_service
from src.f1_data import (
    load_session,
    get_qualifying_results,
    get_driver_quali_telemetry,
    enable_cache,
)

logger = logging.getLogger(__name__)


def _rgb_to_hex(rgb) -> str:
    if isinstance(rgb, str) and rgb.startswith("#"):
        return rgb
    if isinstance(rgb, (tuple, list)) and len(rgb) >= 3:
        return f"#{int(rgb[0]):02x}{int(rgb[1]):02x}{int(rgb[2]):02x}"
    return "#808080"


class QualiService:
    """Service providing qualifying results and high-precision distance telemetry."""

    def _get_fixture_dir(self, sid: str) -> Optional[Path]:
        fixture_dir = Path("web/fixtures/suzuka-2026-r3")
        if (sid == "suzuka-2026-r3" or sid == "2026_3_Q" or sid == "2026_3_R") and fixture_dir.exists():
            return fixture_dir
        return None

    def get_results(self, sid: str) -> QualiResultsResponse:
        """Get qualifying classification for a session."""
        # 1. Check disk cache
        cache_file = config.web_data_dir / sid / "quali_results.json"
        if cache_file.exists():
            try:
                with open(cache_file, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    return QualiResultsResponse(**data)
            except Exception as e:
                logger.warning("Failed to load cached quali results for %s: %s", sid, e)

        # 2. Check fixture
        fix_dir = self._get_fixture_dir(sid)
        if fix_dir:
            fix_file = fix_dir / "quali_results.json"
            if fix_file.exists():
                with open(fix_file, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    data["sessionId"] = sid
                    return QualiResultsResponse(**data)

        # 3. Live FastF1 query
        try:
            year, round_num, _ = session_service.parse_session_id(sid)
            enable_cache()
            session = load_session(year, round_num, "Q")
            raw_results = get_qualifying_results(session)

            driver_results: list[QualiDriverResult] = []
            pole_time: Optional[float] = None
            pole_driver: Optional[str] = None

            for row in raw_results:
                code = row["code"]
                pos = int(row["position"])
                q1 = float(row["Q1"]) if row.get("Q1") is not None else None
                q2 = float(row["Q2"]) if row.get("Q2") is not None else None
                q3 = float(row["Q3"]) if row.get("Q3") is not None else None

                times = [t for t in (q3, q2, q1) if t is not None]
                best = min(times) if times else None

                if pos == 1:
                    pole_time = best
                    pole_driver = code

                color_hex = _rgb_to_hex(row.get("color", "#808080"))
                team_name = ""
                try:
                    drv_meta = session.get_driver(code)
                    team_name = str(drv_meta.get("TeamName", ""))
                except Exception:
                    pass

                driver_results.append(
                    QualiDriverResult(
                        code=code,
                        fullName=row.get("full_name", code),
                        position=pos,
                        color=color_hex,
                        team=team_name,
                        q1=q1,
                        q2=q2,
                        q3=q3,
                        bestLap=best,
                        gap=None,
                        compound="SOFT",
                    )
                )

            # Sort by position
            driver_results.sort(key=lambda r: r.position)

            # Calculate gap to pole
            for r in driver_results:
                if pole_time is not None and r.bestLap is not None:
                    r.gap = round(r.bestLap - pole_time, 3)

            res = QualiResultsResponse(
                sessionId=sid,
                eventName=str(getattr(session.event, "EventName", "Qualifying")),
                circuitName=str(getattr(session.event, "Location", "Circuit")),
                poleLap=pole_time,
                poleDriver=pole_driver,
                results=driver_results,
            )

            # Cache to disk
            try:
                out_dir = config.web_data_dir / sid
                out_dir.mkdir(parents=True, exist_ok=True)
                with open(cache_file, "w", encoding="utf-8") as f:
                    f.write(res.model_dump_json(indent=2))
            except Exception as e:
                logger.warning("Failed to cache quali results: %s", e)

            return res

        except Exception as e:
            logger.error("Failed to load qualifying results for %s: %s", sid, e)
            raise HTTPException(
                status_code=404,
                detail={"code": "quali_not_found", "message": f"Qualifying data not found for session '{sid}': {e}"},
            )

    def get_telemetry(self, sid: str, driver: str, segment: str = "Q3") -> QualiTelemetryResponse:
        """Get distance-resampled telemetry for driver best lap in segment."""
        segment_norm = segment.upper()
        if segment_norm not in ("Q1", "Q2", "Q3"):
            raise HTTPException(
                status_code=400,
                detail={"code": "invalid_segment", "message": "Segment must be 'Q1', 'Q2', or 'Q3'"},
            )

        # 1. Check fixture
        fix_dir = self._get_fixture_dir(sid)
        if fix_dir:
            fix_file = fix_dir / "quali_telemetry.json"
            if fix_file.exists():
                results_resp = self.get_results(sid)
                driver_res = next((r for r in results_resp.results if r.code == driver), None)
                if not driver_res:
                    raise HTTPException(
                        status_code=404,
                        detail={"code": "driver_not_found", "message": f"Driver '{driver}' not found in session"},
                    )
                # Check participation in segment
                participated = (
                    (segment_norm == "Q1" and driver_res.q1 is not None)
                    or (segment_norm == "Q2" and driver_res.q2 is not None)
                    or (segment_norm == "Q3" and driver_res.q3 is not None)
                )
                if not participated:
                    raise HTTPException(
                        status_code=404,
                        detail={
                            "code": "driver_not_in_segment",
                            "message": f"Driver '{driver}' did not participate in {segment_norm}",
                        },
                    )

                with open(fix_file, "r", encoding="utf-8") as f:
                    fix_data = json.load(f)
                    drv_data = fix_data.get(driver, {})
                    seg_data = drv_data.get(segment_norm)
                    if seg_data:
                        return QualiTelemetryResponse(
                            driver=driver,
                            segment=segment_norm,
                            lapTime=seg_data.get("lapTime"),
                            sectors=SectorTimes(**seg_data.get("sectors", {})),
                            compound=seg_data.get("compound", "SOFT"),
                            distance=seg_data.get("distance", []),
                            speed=seg_data.get("speed", []),
                            gear=seg_data.get("gear", []),
                            throttle=seg_data.get("throttle", []),
                            brake=seg_data.get("brake", []),
                            x=seg_data.get("x", []),
                            y=seg_data.get("y", []),
                            time=seg_data.get("time", []),
                        )


        # Pre-check driver participation from qualifying results
        try:
            results_resp = self.get_results(sid)
            driver_res = next((r for r in results_resp.results if r.code == driver), None)
            if not driver_res:
                raise HTTPException(
                    status_code=404,
                    detail={"code": "driver_not_found", "message": f"Driver '{driver}' not found in session"},
                )
            participated = (
                (segment_norm == "Q1" and driver_res.q1 is not None)
                or (segment_norm == "Q2" and driver_res.q2 is not None)
                or (segment_norm == "Q3" and driver_res.q3 is not None)
            )
            if not participated:
                raise HTTPException(
                    status_code=404,
                    detail={
                        "code": "driver_not_in_segment",
                        "message": f"Driver '{driver}' did not participate in {segment_norm}",
                    },
                )
        except HTTPException:
            raise
        except Exception as e:
            logger.debug("Participation pre-check skipped: %s", e)

        # 2. Live FastF1 query
        try:
            year, round_num, _ = session_service.parse_session_id(sid)
            enable_cache()
            session = load_session(year, round_num, "Q")
            data = get_driver_quali_telemetry(session, driver, segment_norm)

            frames = data.get("frames", [])
            if not frames:
                raise HTTPException(
                    status_code=404,
                    detail={
                        "code": "empty_telemetry",
                        "message": f"No telemetry frames returned for driver '{driver}' in {segment_norm}",
                    },
                )

            # Extract raw distance series
            raw_t = [f["t"] for f in frames]
            raw_dist = [f["telemetry"]["dist"] for f in frames]
            raw_speed = [f["telemetry"]["speed"] for f in frames]
            raw_gear = [f["telemetry"]["gear"] for f in frames]
            raw_throttle = [f["telemetry"]["throttle"] for f in frames]
            raw_brake = [f["telemetry"]["brake"] for f in frames]
            raw_x = [f["telemetry"]["x"] for f in frames]
            raw_y = [f["telemetry"]["y"] for f in frames]

            # Uniform distance grid at 10m intervals
            max_dist = max(raw_dist)
            grid_dist = np.arange(0, max_dist, 10.0)
            if len(grid_dist) == 0 or grid_dist[-1] < max_dist:
                grid_dist = np.append(grid_dist, max_dist)

            # Sort raw distance monotonically for np.interp
            raw_dist_arr = np.array(raw_dist)
            sort_order = np.argsort(raw_dist_arr)
            raw_dist_sorted = raw_dist_arr[sort_order]

            # Drop duplicates in raw_dist_sorted
            unique_mask = np.diff(raw_dist_sorted, prepend=-1) > 1e-4
            raw_dist_sorted = raw_dist_sorted[unique_mask]

            interp_speed = np.interp(grid_dist, raw_dist_sorted, np.array(raw_speed)[sort_order][unique_mask])
            interp_th = np.interp(grid_dist, raw_dist_sorted, np.array(raw_throttle)[sort_order][unique_mask])
            interp_br = np.interp(grid_dist, raw_dist_sorted, np.array(raw_brake)[sort_order][unique_mask])
            interp_x = np.interp(grid_dist, raw_dist_sorted, np.array(raw_x)[sort_order][unique_mask])
            interp_y = np.interp(grid_dist, raw_dist_sorted, np.array(raw_y)[sort_order][unique_mask])
            interp_t = np.interp(grid_dist, raw_dist_sorted, np.array(raw_t)[sort_order][unique_mask])

            # Forward-fill / step interpolate gear
            gear_sorted = np.array(raw_gear)[sort_order][unique_mask]
            idxs = np.searchsorted(raw_dist_sorted, grid_dist, side="right") - 1
            idxs = np.clip(idxs, 0, len(gear_sorted) - 1)
            interp_gear = gear_sorted[idxs].astype(int)

            sec_times = data.get("sector_times", {})
            sectors = SectorTimes(
                sector1=sec_times.get("sector1"),
                sector2=sec_times.get("sector2"),
                sector3=sec_times.get("sector3"),
            )

            compound_name = "SOFT"
            if data.get("compound") == 1:
                compound_name = "MEDIUM"
            elif data.get("compound") == 2:
                compound_name = "HARD"

            return QualiTelemetryResponse(
                driver=driver,
                segment=segment_norm,
                lapTime=raw_t[-1] if raw_t else None,
                sectors=sectors,
                compound=compound_name,
                distance=[round(float(d), 1) for d in grid_dist],
                speed=[round(float(s), 1) for s in interp_speed],
                gear=[int(g) for g in interp_gear],
                throttle=[round(float(th), 1) for th in interp_th],
                brake=[round(float(br), 1) for br in interp_br],
                x=[round(float(x), 2) for x in interp_x],
                y=[round(float(y), 2) for y in interp_y],
                time=[round(float(t), 3) for t in interp_t],
            )

        except HTTPException:
            raise
        except ValueError as e:
            raise HTTPException(
                status_code=404,
                detail={"code": "driver_not_found", "message": str(e)},
            )
        except Exception as e:
            logger.error("Failed to get quali telemetry for %s %s: %s", driver, segment_norm, e)
            raise HTTPException(
                status_code=500,
                detail={"code": "telemetry_error", "message": f"Failed to compute quali telemetry: {e}"},
            )


quali_service = QualiService()
