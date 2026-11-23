"""Export already-processed sessions as static files for the hosted (Vercel) demo.

The hosted site has no Python backend, so everything the frontend would normally
fetch from /api/sessions/{sid}/... is written to web/public/demo/{sid}/... instead:

    meta.json, track.json, laps.json, stints.json, race_control.json,
    weather.json, events.json, ml.json      -> exactly what the API returns
    chunk_{k}.bin.gz                         -> gzipped F1SC binary frame chunks

plus web/public/demo/index.json, the manifest the home page reads.

Nothing here touches FastF1 or the network: it only reads computed_data/web/<sid>.

Usage (from the f1-race-replay folder, with the venv active):
    python scripts/export_static_demo.py                 # every valid race on disk
    python scripts/export_static_demo.py 2026_3_R        # just one
    python scripts/export_static_demo.py --recompute-ml  # re-run ML from the frame store (CPU, local only)
"""

from __future__ import annotations

import argparse
import gzip
import shutil
import sys
from pathlib import Path

import orjson

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from src.web.config import config  # noqa: E402
from src.web.services.ml_service import ml_service  # noqa: E402
from src.web.services.session_service import session_service  # noqa: E402

OUT_DIR = ROOT / "web" / "public" / "demo"
QUALI_FIXTURE = ROOT / "web" / "fixtures" / "suzuka-2026-r3"


def dump(path: Path, obj) -> None:
    path.write_bytes(orjson.dumps(obj))


def models(items):
    return [m.model_dump(by_alias=True, mode="json") for m in items]


def export_race(sid: str, recompute_ml: bool) -> dict | None:
    s = session_service.load_from_disk(sid)
    if s is None:
        print(f"  ! {sid}: could not load from {config.web_data_dir / sid}, skipped")
        return None
    if s.track is None or len(s.track.centerline or []) < 10 or s.frame_store.total_frames < 1500:
        print(f"  ! {sid}: track/frames look incomplete (frames={s.frame_store.total_frames}), skipped")
        return None

    if recompute_ml or s.ml_timelines is None:
        print(f"  - {sid}: computing ML timelines...")
        s.ml_timelines = ml_service.compute_ml_timelines(
            sid=sid,
            frame_store=s.frame_store,
            laps=s.laps,
            stints=s.stints,
            track=s.track,
            total_laps=s.meta.total_laps or 53,
            events=s.events,
        )

    out = OUT_DIR / sid
    if out.exists():
        shutil.rmtree(out)
    out.mkdir(parents=True)

    dump(out / "meta.json", s.meta.model_dump(by_alias=True, mode="json"))
    dump(out / "track.json", s.track.model_dump(by_alias=True, mode="json"))
    dump(out / "laps.json", models(s.laps))
    dump(out / "stints.json", models(s.stints))
    dump(out / "race_control.json", models(s.race_control))
    dump(out / "weather.json", models(s.weather))
    dump(out / "events.json", models(s.events))
    dump(out / "ml.json", s.ml_timelines.model_dump(by_alias=True, mode="json"))

    n = s.frame_store.num_chunks
    for k in range(n):
        # mtime=0 keeps the output byte-identical across re-exports (no git churn).
        (out / f"chunk_{k}.bin.gz").write_bytes(gzip.compress(s.frame_store.build_chunk(k), 9, mtime=0))

    size_mb = sum(p.stat().st_size for p in out.iterdir()) / 1e6
    print(f"  + {sid}: {s.meta.event_name}, {s.frame_store.total_frames} frames, {n} chunks, {size_mb:.1f} MB")
    return {
        "sessionId": sid,
        "year": s.meta.year,
        "round": s.meta.round,
        "type": s.meta.type,
        "eventName": s.meta.event_name,
        "circuitName": s.meta.circuit_name,
        "country": s.meta.country,
        "date": s.meta.date,
        "totalLaps": s.meta.total_laps,
        "numChunks": n,
    }


def export_quali_from_fixture(race_entry: dict) -> dict | None:
    """Ship the Suzuka quali fixture as <year>_<round>_Q.

    NOTE: that fixture is placeholder data (older grid, e.g. TSU / Red Bull VER), not the real
    2026 qualifying session, so it is only exported with --with-quali-fixture.
    """
    if not (QUALI_FIXTURE / "quali_results.json").exists():
        return None
    sid = f"{race_entry['year']}_{race_entry['round']}_Q"
    out = OUT_DIR / sid
    if out.exists():
        shutil.rmtree(out)
    out.mkdir(parents=True)
    shutil.copy(QUALI_FIXTURE / "quali_results.json", out / "quali_results.json")
    # 22 MB of JSON -> a few MB; the frontend gunzips it with DecompressionStream.
    (out / "quali_telemetry.json.gz").write_bytes(
        gzip.compress((QUALI_FIXTURE / "quali_telemetry.json").read_bytes(), 9, mtime=0)
    )
    shutil.copy(OUT_DIR / race_entry["sessionId"] / "track.json", out / "track.json")
    print(f"  + {sid}: qualifying (from fixture)")
    return {**race_entry, "sessionId": sid, "type": "Q", "numChunks": 0}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("sids", nargs="*", help="session ids, e.g. 2026_3_R (default: all races on disk)")
    ap.add_argument("--recompute-ml", action="store_true")
    ap.add_argument("--with-quali-fixture", action="store_true",
                    help="also publish the (placeholder) Suzuka quali fixture as 2026_3_Q")
    args = ap.parse_args()

    sids = args.sids or sorted(
        p.name for p in config.web_data_dir.iterdir() if p.is_dir() and p.name.endswith("_R")
    )
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    print(f"Exporting {sids} -> {OUT_DIR}")

    entries = []
    for sid in sids:
        e = export_race(sid, args.recompute_ml)
        if e:
            entries.append(e)
            # Suzuka 2026 R3 is the session the quali fixture was captured from.
            if args.with_quali_fixture and e["year"] == 2026 and e["round"] == 3:
                q = export_quali_from_fixture(e)
                if q:
                    entries.append(q)

    # Drop stale session folders that are no longer in the manifest.
    keep = {e["sessionId"] for e in entries}
    for p in OUT_DIR.iterdir():
        if p.is_dir() and p.name not in keep:
            shutil.rmtree(p)

    dump(OUT_DIR / "index.json", {"sessions": entries})
    total = sum(f.stat().st_size for f in OUT_DIR.rglob("*") if f.is_file()) / 1e6
    print(f"Wrote manifest with {len(entries)} sessions, {total:.1f} MB total")


if __name__ == "__main__":
    main()
