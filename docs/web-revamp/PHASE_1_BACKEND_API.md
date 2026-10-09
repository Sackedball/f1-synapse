# Phase 1 — Backend API

> **Size:** L · **Depends on:** Phase 0 (contract v1.0, LEGACY_LOGIC.md, fixture) · **Branch:** `web/phase-1-backend`

## 1. Goal
A local FastAPI service (`src/web/`) that loads sessions through the **existing** pipeline and serves everything the frontend needs per `REF_API_CONTRACT.md v1.0`: metadata, track geometry, binary frame chunks, laps, stints, race-control messages, weather, and load-progress events. `python main.py --web` starts it.

## 2. Scope
**In:** HTTP API, session loading jobs + SSE progress, columnar chunk building with precomputed `position`/gaps/`inPit`/`status`, caching, tests, CLI flag, OpenAPI → TS type generation script.
**Out:** event detection (Phase 5), ML timelines (Phase 7), qualifying endpoints and settings (Phase 8), any frontend code.

## 3. Principles
- **Wrap, never fork.** Call functions in `src/f1_data.py`; do not copy their logic. If a pipeline function can't be called cleanly, add the smallest possible adapter and note it in `NOTES.md`.
- **Position = sort by cumulative `dist` descending** (single place, one function, golden-tested). Never use `(lap, dist)`.
- **Gaps/PIT/OUT/DNF** are ported from `LEGACY_LOGIC.md` exactly, with tests that assert parity on the fixture.
- **Legacy app must still run unchanged.**

## 4. Tasks

### 4.1 Scaffold
- [ ] Add dependencies to `requirements.txt` (or `requirements-web.txt`): `fastapi`, `uvicorn[standard]`, `orjson`, `pydantic>=2`, `numpy`; dev: `pytest`, `httpx`.
- [ ] Create `src/web/{app.py,config.py,jobs.py,routers/,services/,schemas/}`.
- [ ] `config.py`: host `127.0.0.1`, port 8000 (env override), data/cache paths from the existing settings mechanism (reuse, don't duplicate).
- [ ] Security (D8): bind localhost only; middleware rejecting requests whose `Host` header is not `127.0.0.1:<port>` / `localhost:<port>`; CORS allow-list only for the Vite dev origin (`http://localhost:5173`) in dev mode.

### 4.2 Session service (`services/session_service.py`)
- [ ] `SessionKey(year, round, type)` ↔ `sessionId` string.
- [ ] `load(sessionKey, refresh=False)` → runs the existing loader in a background worker (thread/process). The existing code already uses `multiprocessing.Pool` — do not nest pools inside a daemon process; use a thread that calls the loader, or a `spawn`ed process, and verify on Windows.
- [ ] Emit progress stages (`queued → downloading → processing_drivers n/N → resampling → indexing_events → ready`) into a per-job asyncio queue; expose via SSE (`/api/jobs/{id}/events`) and polling (`/api/jobs/{id}`).
- [ ] Idempotent: concurrent loads of the same session share one job. Already-cached sessions return `ready` immediately.
- [ ] Errors map to the contract error shape (FastF1 API down, session not available, corrupt cache).

### 4.3 Columnar store (`services/frame_store.py`)
- [ ] Convert the loaded frames (list of dicts) **once** into per-channel numpy arrays shaped `[driverIndex, frame]` using dtypes from the contract. Persist to `computed_data/web/{sid}/channels.npz` for instant reload; invalidate when the source pickle's mtime changes.
- [ ] Precompute `position` (dist-desc sort per frame, vectorised), `gapAhead`, `gapLeader`, `inPit`, `status`, `trackStatus`, safety-car channels. Ties broken deterministically by driver index.
- [ ] `build_chunk(k)` → bytes in the exact v1.0 binary format; chunk bytes cached (LRU) and served with `ETag`/immutable cache headers; honor `Accept-Encoding: gzip`.
- [ ] Memory guard: log total array size at load.

### 4.4 Track service (`services/track_service.py`)
- [ ] Build `TrackGeometry` from the pipeline's reference lap: centerline, inner/outer edges (use the same normal-vector approach as the legacy renderer), bounds, rotation, finish index, DRS zones, sector indices, corners (FastF1 circuit info if available, else omit), length.
- [ ] Verify centerline is ordered in the direction of travel.

### 4.5 Data routers
- [ ] `GET /meta`, `/track`, `/frames/{k}`, `/laps`, `/stints`, `/race-control`, `/weather` per contract. `laps`/`stints` come from FastF1 data already loaded by the pipeline (do not re-download). `/stints` is derived from session data each load — **no stale `tyre_state.json`** dependency.
- [ ] Schedule + cache status endpoints for the home screen (`/seasons/{y}/schedule`, `/cache/status`).
- [ ] Stub `/events` returning `[]` and `/ml` returning 404 `not_implemented` (filled in Phases 5 and 7).

### 4.6 CLI + dev ergonomics
- [ ] `main.py --web [--port N] [--no-browser] [--year Y --round R --session S]`: start uvicorn; optionally open the browser to `/?session=<id>`. Default behaviour of `main.py` without `--web` is **unchanged**.
- [ ] Serve `web/dist` statically if present (SPA fallback to `index.html`); in dev, frontend runs on Vite and proxies `/api`.
- [ ] `scripts/gen_types.sh|.ps1`: dump OpenAPI JSON and run `openapi-typescript` into `web/src/api/types.gen.ts` (the frontend phase wires the npm side).

### 4.7 Tests (`tests/web/`)
- [ ] **Golden position test:** on the fixture, `position` equals the dist-desc ranking at 20 sampled frames; and test explicitly that a car with a higher lap counter but lower `dist` (synthetic) is ranked by `dist`.
- [ ] `dist` is monotonic non-decreasing per driver.
- [ ] Chunk round-trip: build → parse (Python reference decoder) → equals source arrays; header magic/offsets/alignment correct; NaN preserved.
- [ ] Gap parity: server `gapAhead/gapLeader` equals legacy leaderboard logic on fixture frames.
- [ ] API tests with `httpx.AsyncClient`: meta, track, chunk 0 and last partial chunk, 404 for chunk past end, error shape, ETag/304 behaviour, Host-header rejection.
- [ ] Job lifecycle test with a stubbed loader (progress order, idempotence, failure path).

## 5. Files
**Create:** everything under `src/web/`, `tests/web/`, `scripts/gen_types.*`.
**Modify:** `main.py` (add `--web`), `requirements*.txt`.
**Delete:** nothing.

## 6. Acceptance criteria
- [ ] AC1: `python main.py --web` starts the service; `GET /api/health` returns 200; the legacy `python main.py` flow still opens the legacy UI.
- [ ] AC2: Loading the Suzuka 2026 R3 race via `POST /api/sessions/load` streams progress via SSE and ends `ready`; second call is instant (cache).
- [ ] AC3: `/meta`, `/track`, `/frames/0`, `/frames/last`, `/laps`, `/stints`, `/race-control`, `/weather` return data matching the contract (validated by tests against the OpenAPI schema).
- [ ] AC4: Chunk fetch for a typical chunk < 150 ms locally (warm), < 600 ms (cold); size within the Phase 0 budget.
- [ ] AC5: All tests in §4.7 pass (paste `pytest -q` output).
- [ ] AC6: A request with a foreign `Host` header is rejected.
- [ ] AC7: `scripts/gen_types` produces `types.gen.ts` with no errors.
- [ ] AC8: No logic from `f1_data.py` was copied; grep shows only imports/calls.

## 7. Verification
- `pytest -q` output.
- `curl` transcripts for each endpoint saved in `evidence/phase-1/`.
- A tiny Python script decoding chunk 0 and printing leader order at t = 0, 30, 60 s — compare with the legacy leaderboard at the same moments (screenshot of legacy at those times side by side).
- Memory/time numbers from load logged in the report.

## 8. Pitfalls
- Windows multiprocessing `spawn` + uvicorn reload: disable reload for the worker path; guard with `if __name__ == "__main__"`.
- Don't hold the GIL in request handlers — heavy work stays in the job worker; handlers only slice cached arrays.
- Float NaN → JSON: use `null` in JSON endpoints; keep NaN only in binary chunks.
- Don't re-derive `position` per request; it is precomputed once at load.

## 9. Hand-off
Phase 2 relies on: generated TS types, `/meta`, `/track`, `/frames/{k}`, stable chunk format, fixture. Phase 5 adds `/events`; Phase 7 adds `/ml`; Phase 8 adds qualifying + settings.

## 10. Kickoff prompt (copy-paste)
```
You are starting Phase 1 (Backend API) of the F1 Synapse web revamp.
Read in order: docs/web-revamp/00_MASTER_PLAN.md, PHASE_1_BACKEND_API.md,
REF_API_CONTRACT.md (v1.0), LEGACY_LOGIC.md, DECISIONS.md.
Follow the global agent rules strictly. Phase 0 must be complete and the
mockups approved; if not, stop and tell me.

Build src/web/ as specified. Wrap existing pipeline functions; do not copy their
logic. position = dist-descending sort (golden-tested). Keep the legacy app
working. Implement section 4 in order, committing after each sub-section, and
write the tests as you go. Finish with the Phase report including pytest output
and curl evidence. Do not start any frontend work.
```
