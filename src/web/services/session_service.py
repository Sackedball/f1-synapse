"""SessionService: session loading, metadata generation, and data persistence."""

import logging
from pathlib import Path
from typing import Optional
import orjson
import pandas as pd

from src.web.config import config
from src.web.schemas import (
    DriverInfo,
    SessionMeta,
    TrackGeometry,
    LapRow,
    Stint,
    RaceControlMessage,
    WeatherSample,
    RaceEvent,
    MlTimelines,
)
from src.web.services.frame_store import FrameStore, FPS
from src.web.services.track_service import build_track_geometry
from src.web.services.events_service import events_service
from src.web.services.ml_service import ml_service
from src.f1_data import (
    load_session,
    get_race_telemetry,
    get_driver_colors,
    enable_cache,
)

logger = logging.getLogger(__name__)


class LoadedSession:
    def __init__(
        self,
        meta: SessionMeta,
        track: TrackGeometry,
        frame_store: FrameStore,
        laps: list[LapRow],
        stints: list[Stint],
        race_control: list[RaceControlMessage],
        weather: list[WeatherSample],
        events: Optional[list[RaceEvent]] = None,
        ml_timelines: Optional[MlTimelines] = None,
    ):
        self.meta = meta
        self.track = track
        self.frame_store = frame_store
        self.laps = laps
        self.stints = stints
        self.race_control = race_control
        self.weather = weather
        self.events = events if events is not None else []
        self.ml_timelines = ml_timelines


class SessionService:
    def __init__(self):
        self._sessions: dict[str, LoadedSession] = {}

    @staticmethod
    def session_id(year: int, round_num: int, session_type: str = "R") -> str:
        return f"{year}_{round_num}_{session_type}"

    @staticmethod
    def parse_session_id(sid: str) -> tuple[int, int, str]:
        parts = sid.split("_")
        if len(parts) >= 3:
            return int(parts[0]), int(parts[1]), parts[2]
        raise ValueError(f"Invalid session id: {sid}")

    def find_source_mtime(self, sid: str) -> Optional[float]:
        try:
            year, round_num, session_type = self.parse_session_id(sid)
            # 1. Direct legacy file / base file (e.g. 2026_Season_Round_3)
            base_file = config.computed_data_dir / f"{year}_Season_Round_{round_num}"
            if base_file.exists():
                return base_file.stat().st_mtime

            # 2. Glob for any matching file in computed_data (including telemetry pickles)
            pattern = f"*{year}*Round_{round_num}*"
            matches = list(config.computed_data_dir.glob(pattern))
            if matches:
                return max(m.stat().st_mtime for m in matches if m.is_file())
        except Exception as e:
            logger.debug("Failed to find source mtime for %s: %s", sid, e)
        return None

    def is_cached_on_disk(self, sid: str) -> bool:
        dir_path = config.web_data_dir / sid
        npz_file = dir_path / "channels.npz"
        meta_file = dir_path / "meta.json"
        if not npz_file.exists() or not meta_file.exists():
            return False

        # Validate store metadata version
        store_meta_file = dir_path / "store_meta.json"
        if not store_meta_file.exists():
            return False
        try:
            with open(store_meta_file, "rb") as f:
                sm = orjson.loads(f.read())
            if sm.get("version", 1) < 2:
                logger.info("Session %s cache version < 2; invalidating cache", sid)
                return False
        except Exception:
            return False

        # Invalidate when source data/pickle is newer than cached channels.npz
        source_mtime = self.find_source_mtime(sid)
        if source_mtime is not None:
            if source_mtime > npz_file.stat().st_mtime:
                logger.info(
                    "Source telemetry for %s (mtime %s) is newer than channels.npz (%s); invalidating cache",
                    sid,
                    source_mtime,
                    npz_file.stat().st_mtime,
                )
                return False

        return True

    def get_loaded(self, sid: str) -> Optional[LoadedSession]:
        return self._sessions.get(sid)

    def load_from_disk(self, sid: str) -> Optional[LoadedSession]:
        dir_path = config.web_data_dir / sid
        if not self.is_cached_on_disk(sid):
            return None

        try:
            with open(dir_path / "meta.json", "rb") as f:
                meta = SessionMeta.model_validate(orjson.loads(f.read()))

            driver_codes = [d.code for d in meta.drivers]
            frame_store = FrameStore.load(dir_path)
            if frame_store is None:
                return None

            track = None
            if (dir_path / "track.json").exists():
                with open(dir_path / "track.json", "rb") as f:
                    track = TrackGeometry.model_validate(orjson.loads(f.read()))

            laps = []
            if (dir_path / "laps.json").exists():
                with open(dir_path / "laps.json", "rb") as f:
                    laps = [LapRow.model_validate(r) for r in orjson.loads(f.read())]

            stints = []
            if (dir_path / "stints.json").exists():
                with open(dir_path / "stints.json", "rb") as f:
                    stints = [Stint.model_validate(r) for r in orjson.loads(f.read())]

            race_control = []
            if (dir_path / "race_control.json").exists():
                with open(dir_path / "race_control.json", "rb") as f:
                    race_control = [RaceControlMessage.model_validate(r) for r in orjson.loads(f.read())]

            weather = []
            if (dir_path / "weather.json").exists():
                with open(dir_path / "weather.json", "rb") as f:
                    weather = [WeatherSample.model_validate(r) for r in orjson.loads(f.read())]

            events = []
            if (dir_path / "events.json").exists():
                with open(dir_path / "events.json", "rb") as f:
                    events = [RaceEvent.model_validate(r) for r in orjson.loads(f.read())]
            else:
                events = events_service.detect_all(
                    frame_store=frame_store,
                    laps=laps,
                    stints=stints,
                    race_control=race_control,
                    total_laps=meta.total_laps or 53,
                )
                try:
                    with open(dir_path / "events.json", "wb") as f:
                        f.write(orjson.dumps([e.model_dump(by_alias=True) for e in events]))
                except Exception as ex:
                    logger.debug("Failed to write events.json cache: %s", ex)

            ml_timelines = None
            if (dir_path / "ml.json").exists():
                try:
                    with open(dir_path / "ml.json", "rb") as f:
                        ml_timelines = MlTimelines.model_validate(orjson.loads(f.read()))
                except Exception as ex:
                    logger.debug("Failed to read ml.json cache: %s", ex)
            else:
                try:
                    ml_timelines = ml_service.compute_ml_timelines(
                        sid=sid,
                        frame_store=frame_store,
                        laps=laps,
                        stints=stints,
                        track=track,
                        total_laps=meta.total_laps or 53,
                    )
                    with open(dir_path / "ml.json", "wb") as f:
                        f.write(orjson.dumps(ml_timelines.model_dump(by_alias=True)))
                except Exception as ex:
                    logger.debug("Failed to compute and cache ml.json: %s", ex)

            session = LoadedSession(
                meta=meta,
                track=track,
                frame_store=frame_store,
                laps=laps,
                stints=stints,
                race_control=race_control,
                weather=weather,
                events=events,
                ml_timelines=ml_timelines,
            )
            self._sessions[sid] = session
            return session
        except Exception as e:
            logger.warning("Failed to load session %s from disk: %s", sid, e)
            return None

    def load_fixture(self, fixture_path: Path, sid: str = "suzuka-2026-r3") -> LoadedSession:
        """Load fixture directly from fixture directory."""
        with open(fixture_path / "drivers.json", "rb") as f:
            drivers_raw = orjson.loads(f.read())

        with open(fixture_path / "track.json", "rb") as f:
            track_raw = orjson.loads(f.read())

        with open(fixture_path / "frames_120s.json", "rb") as f:
            frames = orjson.loads(f.read())

        driver_infos = [
            DriverInfo(
                code=d["code"],
                number=d.get("number", 0),
                full_name=d.get("fullName", d["code"]),
                team=d.get("team", ""),
                color=d.get("color", "#ffffff"),
                index=i,
            )
            for i, d in enumerate(drivers_raw)
        ]
        driver_codes = [d.code for d in driver_infos]

        track = TrackGeometry.model_validate(track_raw)
        frame_store = FrameStore.from_frames(
            sid=sid,
            frames=frames,
            driver_codes=driver_codes,
            track=track,
            total_laps=53,
        )

        meta = SessionMeta(
            session_id=sid,
            year=2026,
            round=3,
            type="R",
            event_name="Japanese Grand Prix",
            circuit_name="Suzuka",
            country="Japan",
            date="2026-04-05",
            total_laps=53,
            total_frames=len(frames),
            fps=FPS,
            chunk_size=1500,
            duration_sec=len(frames) / FPS,
            drivers=driver_infos,
        )

        laps = []
        if (fixture_path / "laps.json").exists():
            with open(fixture_path / "laps.json", "rb") as f:
                laps = [LapRow.model_validate(r) for r in orjson.loads(f.read())]

        stints = []
        if (fixture_path / "stints.json").exists():
            with open(fixture_path / "stints.json", "rb") as f:
                stints = [Stint.model_validate(r) for r in orjson.loads(f.read())]

        race_control = []
        if (fixture_path / "race_control.json").exists():
            with open(fixture_path / "race_control.json", "rb") as f:
                race_control = [RaceControlMessage.model_validate(r) for r in orjson.loads(f.read())]

        weather = []
        if (fixture_path / "weather.json").exists():
            with open(fixture_path / "weather.json", "rb") as f:
                weather = [WeatherSample.model_validate(r) for r in orjson.loads(f.read())]

        events = []
        if (fixture_path / "events.json").exists():
            with open(fixture_path / "events.json", "rb") as f:
                events = [RaceEvent.model_validate(r) for r in orjson.loads(f.read())]
        else:
            events = events_service.detect_all(
                frame_store=frame_store,
                laps=laps,
                stints=stints,
                race_control=race_control,
                total_laps=meta.total_laps or 53,
            )
            try:
                with open(fixture_path / "events.json", "wb") as f:
                    f.write(orjson.dumps([e.model_dump(by_alias=True) for e in events]))
            except Exception as ex:
                logger.debug("Failed to cache fixture events.json: %s", ex)

        ml_timelines = None
        if (fixture_path / "ml.json").exists():
            try:
                with open(fixture_path / "ml.json", "rb") as f:
                    ml_timelines = MlTimelines.model_validate(orjson.loads(f.read()))
            except Exception as ex:
                logger.debug("Failed to read fixture ml.json cache: %s", ex)
        else:
            try:
                ml_timelines = ml_service.compute_ml_timelines(
                    sid=sid,
                    frame_store=frame_store,
                    laps=laps,
                    stints=stints,
                    track=track,
                    total_laps=meta.total_laps or 53,
                )
                with open(fixture_path / "ml.json", "wb") as f:
                    f.write(orjson.dumps(ml_timelines.model_dump(by_alias=True)))
            except Exception as ex:
                logger.debug("Failed to cache fixture ml.json: %s", ex)

        loaded = LoadedSession(
            meta=meta,
            track=track,
            frame_store=frame_store,
            laps=laps,
            stints=stints,
            race_control=race_control,
            weather=weather,
            events=events,
            ml_timelines=ml_timelines,
        )
        self._sessions[sid] = loaded
        return loaded

    def process_and_save_session(
        self,
        year: int,
        round_num: int,
        session_type: str,
        progress_cb=None,
    ) -> LoadedSession:
        sid = self.session_id(year, round_num, session_type)
        enable_cache()

        if progress_cb:
            progress_cb("downloading", 0.20, f"Loading session {sid} from FastF1...")

        session = load_session(year, round_num, session_type)

        if progress_cb:
            progress_cb("processing_drivers", 0.50, f"Extracting race telemetry for {session}...")

        telemetry_data = get_race_telemetry(session, session_type)
        frames = telemetry_data["frames"]
        driver_colors = telemetry_data.get("driver_colors", {})
        track_statuses = telemetry_data.get("track_statuses", [])
        total_laps = int(telemetry_data.get("total_laps", 0))

        # Extract drivers from session.results or session.drivers
        driver_infos = []
        if hasattr(session, "results") and session.results is not None and not session.results.empty:
            for idx, (_, res) in enumerate(session.results.iterrows()):
                code = str(res["Abbreviation"])
                rgb = driver_colors.get(code, (255, 255, 255))
                hex_color = f"#{rgb[0]:02x}{rgb[1]:02x}{rgb[2]:02x}"
                driver_num = int(res["DriverNumber"]) if str(res.get("DriverNumber", "")).isdigit() else 0
                driver_infos.append(
                    DriverInfo(
                        code=code,
                        number=driver_num,
                        full_name=str(res.get("FullName", code)),
                        team=str(res.get("TeamName", "")),
                        color=hex_color,
                        index=idx,
                    )
                )
        else:
            for idx, num in enumerate(session.drivers):
                d_info = session.get_driver(num)
                code = str(d_info["Abbreviation"])
                rgb = driver_colors.get(code, (255, 255, 255))
                hex_color = f"#{rgb[0]:02x}{rgb[1]:02x}{rgb[2]:02x}"
                driver_infos.append(
                    DriverInfo(
                        code=code,
                        number=int(num) if str(num).isdigit() else 0,
                        full_name=str(d_info.get("FullName", code)),
                        team=str(d_info.get("TeamName", "")),
                        color=hex_color,
                        index=idx,
                    )
                )

        driver_codes = [d.code for d in driver_infos]

        # Track geometry from qualifying fastest lap or race fastest lap
        if progress_cb:
            progress_cb("indexing_events", 0.70, "Building track geometry...")

        example_lap_tel = None
        try:
            quali_session = load_session(year, round_num, "Q")
            if quali_session is not None and len(quali_session.laps) > 0:
                fastest_q = quali_session.laps.pick_fastest()
                if fastest_q is not None:
                    example_lap_tel = fastest_q.get_telemetry()
        except Exception:
            pass

        if example_lap_tel is None or example_lap_tel.empty:
            fastest_lap = session.laps.pick_fastest() if len(session.laps) > 0 else None
            if fastest_lap is not None:
                example_lap_tel = fastest_lap.get_telemetry()

        track = build_track_geometry(example_lap_tel, session=session)

        if progress_cb:
            progress_cb("resampling", 0.75, "Converting frames to columnar store...")

        frame_store = FrameStore.from_frames(
            sid=sid,
            frames=frames,
            driver_codes=driver_codes,
            track_statuses=track_statuses,
            track=track,
            total_laps=total_laps,
        )

        if progress_cb:
            progress_cb("indexing_events", 0.85, "Building laps and stints...")

        # Laps and Stints
        laps = self._extract_laps(session)
        stints = self._extract_stints(session)
        weather = self._extract_weather(session)
        race_control = self._extract_race_control(telemetry_data, session)

        event_name = str(session.event.get("EventName", "Grand Prix"))
        circuit_name = str(session.event.get("Location", ""))
        country = str(session.event.get("Country", ""))
        date_str = str(session.event.get("EventDate", "").date()) if hasattr(session.event.get("EventDate"), "date") else ""

        meta = SessionMeta(
            session_id=sid,
            year=year,
            round=round_num,
            type=session_type,
            event_name=event_name,
            circuit_name=circuit_name,
            country=country,
            date=date_str,
            total_laps=total_laps,
            total_frames=len(frames),
            fps=FPS,
            chunk_size=1500,
            duration_sec=len(frames) / FPS,
            drivers=driver_infos,
        )

        # Persist to disk
        dir_path = config.web_data_dir / sid
        dir_path.mkdir(parents=True, exist_ok=True)
        frame_store.save(dir_path)

        with open(dir_path / "meta.json", "wb") as f:
            f.write(orjson.dumps(meta.model_dump(by_alias=True)))
        with open(dir_path / "track.json", "wb") as f:
            f.write(orjson.dumps(track.model_dump(by_alias=True)))
        with open(dir_path / "laps.json", "wb") as f:
            f.write(orjson.dumps([l.model_dump(by_alias=True) for l in laps]))
        with open(dir_path / "stints.json", "wb") as f:
            f.write(orjson.dumps([s.model_dump(by_alias=True) for s in stints]))
        with open(dir_path / "weather.json", "wb") as f:
            f.write(orjson.dumps([w.model_dump(by_alias=True) for w in weather]))
        with open(dir_path / "race_control.json", "wb") as f:
            f.write(orjson.dumps([rc.model_dump(by_alias=True) for rc in race_control]))

        if progress_cb:
            progress_cb("indexing_events", 0.85, "Indexing race events")

        events = events_service.detect_all(
            frame_store=frame_store,
            laps=laps,
            stints=stints,
            race_control=race_control,
            total_laps=total_laps,
        )

        with open(dir_path / "events.json", "wb") as f:
            f.write(orjson.dumps([e.model_dump(by_alias=True) for e in events]))

        if progress_cb:
            progress_cb("computing_ml", 0.92, "Computing ML predictive timelines")

        ml_timelines = None
        try:
            ml_timelines = ml_service.compute_ml_timelines(
                sid=sid,
                frame_store=frame_store,
                laps=laps,
                stints=stints,
                track=track,
                total_laps=total_laps,
                progress_cb=progress_cb,
            )
            with open(dir_path / "ml.json", "wb") as f:
                f.write(orjson.dumps(ml_timelines.model_dump(by_alias=True)))
        except Exception as ex:
            logger.warning("Failed to compute ml timelines: %s", ex)

        loaded = LoadedSession(
            meta=meta,
            track=track,
            frame_store=frame_store,
            laps=laps,
            stints=stints,
            race_control=race_control,
            weather=weather,
            events=events,
            ml_timelines=ml_timelines,
        )
        self._sessions[sid] = loaded

        if progress_cb:
            progress_cb("ready", 1.0, "Session ready")

        return loaded

    @staticmethod
    def _extract_laps(session) -> list[LapRow]:
        laps_df = getattr(session, "laps", None)
        if laps_df is None or laps_df.empty:
            return []

        fastest_time = laps_df["LapTime"].dropna().min() if "LapTime" in laps_df else None
        rows = []
        for _, r in laps_df.iterrows():
            lap_time = r.get("LapTime")
            time_sec = (
                lap_time.total_seconds()
                if pd.notna(lap_time) and hasattr(lap_time, "total_seconds")
                else None
            )

            s1 = r.get("Sector1Time")
            s1_sec = s1.total_seconds() if pd.notna(s1) and hasattr(s1, "total_seconds") else None

            s2 = r.get("Sector2Time")
            s2_sec = s2.total_seconds() if pd.notna(s2) and hasattr(s2, "total_seconds") else None

            s3 = r.get("Sector3Time")
            s3_sec = s3.total_seconds() if pd.notna(s3) and hasattr(s3, "total_seconds") else None

            compound = str(r.get("Compound")) if pd.notna(r.get("Compound")) else None
            tyre_life = int(r.get("TyreLife")) if pd.notna(r.get("TyreLife")) else None
            pit_in = bool(pd.notna(r.get("PitInTime")))
            pit_out = bool(pd.notna(r.get("PitOutTime")))
            is_pb = bool(r.get("IsPersonalBest", False)) if pd.notna(r.get("IsPersonalBest")) else False
            is_fastest = bool(lap_time == fastest_time) if pd.notna(lap_time) and pd.notna(fastest_time) else False

            rows.append(
                LapRow(
                    driver=str(r.get("Driver", "")),
                    lap=int(r.get("LapNumber", 0)),
                    time_sec=time_sec,
                    s1=s1_sec,
                    s2=s2_sec,
                    s3=s3_sec,
                    compound=compound,
                    tyre_life=tyre_life,
                    pit_in=pit_in,
                    pit_out=pit_out,
                    is_pb=is_pb,
                    is_fastest=is_fastest,
                )
            )
        return rows

    @staticmethod
    def _extract_stints(session) -> list[Stint]:
        laps_df = getattr(session, "laps", None)
        if laps_df is None or laps_df.empty:
            return []
        stints = []
        for driver in laps_df["Driver"].dropna().unique():
            d_laps = laps_df[laps_df["Driver"] == driver].sort_values("LapNumber")
            if "Stint" in d_laps:
                for stint_num, g in d_laps.groupby("Stint"):
                    compounds = g["Compound"].dropna()
                    comp_str = str(compounds.iloc[0]) if not compounds.empty else "UNKNOWN"
                    stints.append(
                        Stint(
                            driver=str(driver),
                            stint=int(stint_num),
                            compound=comp_str,
                            lap_start=int(g["LapNumber"].min()),
                            lap_end=int(g["LapNumber"].max()),
                        )
                    )
        return stints

    @staticmethod
    def _extract_weather(session) -> list[WeatherSample]:
        weather_df = getattr(session, "weather_data", None)
        if weather_df is None or weather_df.empty:
            return []
        samples = []
        for _, r in weather_df.iterrows():
            t_val = r.get("Time")
            sec = t_val.total_seconds() if hasattr(t_val, "total_seconds") else 0.0
            if sec < 0:
                continue
            rain_val = r.get("Rainfall")
            samples.append(
                WeatherSample(
                    t=round(sec, 2),
                    air_temp=float(r.get("AirTemp", 0.0)),
                    track_temp=float(r.get("TrackTemp", 0.0)),
                    humidity=float(r.get("Humidity", 0.0)),
                    wind_speed=float(r.get("WindSpeed", 0.0)),
                    wind_dir=float(r.get("WindDirection", 0.0)),
                    rainfall=bool(rain_val and float(rain_val) > 0.0),
                )
            )
        return samples

    @staticmethod
    def _extract_race_control(telemetry_data: dict, session) -> list[RaceControlMessage]:
        raw_rc = telemetry_data.get("race_control_messages", [])
        rc_list = []
        driver_number_to_code = {}
        if session and hasattr(session, "drivers"):
            try:
                driver_number_to_code = {
                    str(num): session.get_driver(num)["Abbreviation"]
                    for num in session.drivers
                }
            except Exception:
                pass

        for m in raw_rc:
            t = float(m.get("time", 0.0))
            racing_num = str(m.get("racing_number", ""))
            drivers = []
            if racing_num:
                drv_code = driver_number_to_code.get(racing_num, racing_num)
                drivers.append(drv_code)

            rc_list.append(
                RaceControlMessage(
                    t=t,
                    lap=int(m.get("lap", 0)),
                    category=str(m.get("category", "")),
                    flag=str(m.get("flag", "")) or None,
                    message=str(m.get("message", "")),
                    drivers=drivers if drivers else None,
                )
            )
        return rc_list


session_service = SessionService()
