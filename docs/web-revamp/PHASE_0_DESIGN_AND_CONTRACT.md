# Phase 0 — Design & Contract

> **Size:** M · **Depends on:** nothing · **Branch:** `web/phase-0-design`
> **Owner gate:** the project owner must approve the mockups before Phase 2 starts.

## 1. Goal
Remove every unknown before writing production code: verify the data contract against the real source, lock the visual design as approved mockups, capture a small golden fixture session for fast development, and benchmark the data transport.

## 2. Why this phase exists
Earlier GUI passes went wrong by editing from screenshots and assumptions. This phase produces the verified facts and approved visuals that every later phase is checked against.

## 3. Scope
**In:** source audit, contract verification, static HTML mockups, fixture export, benchmarks, `DECISIONS.md`/`NOTES.md`.
**Out:** any backend service code, any React app code, any change to existing Python files.

## 4. Tasks

### 4.1 Source audit (read-only)
- [ ] Read `src/f1_data.py`. Document the exact structure of one frame: top-level keys and every per-driver key, types, ranges, units, and which can be `None`/`NaN`.
- [ ] Resolve every `VERIFY` item in `REF_API_CONTRACT.md` (units of x/y, DRS value mapping, tyre encoding, trackStatus codes, throttle/brake ranges, safety-car fields, rotation source, sector data, supported session types).
- [ ] Read `LeaderboardComponent` in `src/ui_components.py` and extract the **exact** gap/interval logic, DNF/PIT/OUT rules, and fastest-lap handling. Write them as pseudocode in `docs/web-revamp/LEGACY_LOGIC.md` (these are ported verbatim in Phase 1).
- [ ] Read `src/insights/ml_prediction_window.py` and the ML training/inference code: list model file paths, feature names/order, input windows, and thresholds → `LEGACY_LOGIC.md` (used in Phase 7).
- [ ] Read `src/services/stream.py` payload fields to confirm what the legacy broadcast contained.
- [ ] List all keyboard/mouse interactions from `ControlsPopupComponent` (parity list).

### 4.2 Update the contract
- [ ] Edit `REF_API_CONTRACT.md`: replace each `VERIFY` with the verified fact, bump to **v1.0**, add a version note.

### 4.3 Golden fixture
- [ ] Write a one-off script `scripts/export_fixture.py` that loads the Suzuka 2026 Round 3 race (the session used in the existing screenshots) via the existing pipeline and exports **120 seconds** (frames covering the race start through ~T+120 s) plus the full track geometry and driver list to `web/fixtures/suzuka-2026-r3/` as JSON + one binary chunk in the v1.0 format. Keep it < 5 MB.
- [ ] Also export a 3-minute window around a known position change (overtake) and a safety-car window **if** present in the data; note their time ranges in `fixtures/README.md`.

### 4.4 Transport benchmark
- [ ] Using the full race, build chunks in the v1.0 binary format and measure: raw size, gzip size, encode time, decode time in Node (typed arrays), for chunk sizes 750 / 1500 / 3000 frames. Record a table in `DECISIONS.md` and confirm or adjust `chunkSize` (default 1500).
- [ ] Targets: first chunk fetch+decode < 250 ms locally; total race < 150 MB raw in memory after decode; if exceeded, propose quantisation (e.g. x/y as i16 deltas) and record the decision.

### 4.4b Playback-model sanity check
- [ ] Confirm D1 (client-owned clock) is feasible with the measured numbers. If not, document the fallback (server-authoritative stream) with evidence.

### 4.5 Mockups (static HTML + CSS, no framework)
Build `docs/web-revamp/mockups/` — plain HTML files using the real tokens from `REF_DESIGN_SYSTEM.md` and **real data from the fixture** (real driver codes, real team colors, real track outline drawn as SVG). Required screens at **1920×1080** and **1366×768**:
1. **Race workspace** — top strip, timing tower, circuit canvas with cars/trails/DRS zones, context panel with driver card, bottom timeline with event markers, transport controls.
2. **Race workspace with battle focus** — two cars highlighted, connector with an ML overtake-probability chip, dimmed others.
3. **Analysis workspace** — docked panels (telemetry, head-to-head, lap chart, tyre strategy).
4. **Home screen** — season calendar with cache status chips and a loading-progress state.
5. **Qualifying view.**
6. States sheet: loading skeleton, empty, error, disconnected backend, driver retired (OUT), pit stop (PIT).

Each screen: named regions annotated with the future component names (e.g. `TimingTower`, `TrackCanvas`).

### 4.6 Decision log
- [ ] Create `docs/web-revamp/DECISIONS.md` (ADR list; seed with D1–D10 from the master plan + benchmark results) and `docs/web-revamp/NOTES.md` (out-of-scope findings).

## 5. Files
**Create:** `docs/web-revamp/{DECISIONS.md,NOTES.md,LEGACY_LOGIC.md,mockups/*}`, `scripts/export_fixture.py`, `web/fixtures/suzuka-2026-r3/*`, `web/fixtures/README.md`.
**Modify:** `REF_API_CONTRACT.md` (→ v1.0).
**Delete:** nothing.

## 6. Acceptance criteria
- [ ] AC1: Zero `VERIFY` tags remain in `REF_API_CONTRACT.md`; version note added.
- [ ] AC2: `LEGACY_LOGIC.md` contains pseudocode for gaps, DNF/PIT/OUT, fastest lap, ML features and thresholds, each with source file:line.
- [ ] AC3: Fixture loads in a 10-line Node script and decodes to the documented channels with sane values (positions 1..N unique, dist monotonic).
- [ ] AC4: Benchmark table recorded; chunk size decision justified; D1 confirmed or fallback documented.
- [ ] AC5: All 6 mockup sets exist at both resolutions, use only tokens, and use real fixture data.
- [ ] AC6: **Owner has approved the mockups** (write `DESIGN_APPROVED: <date>` at the top of `mockups/README.md`).

## 7. Verification
- Open each mockup in a browser at both sizes; screenshot into `docs/web-revamp/evidence/phase-0/`.
- Run the fixture decode script; paste output.
- Self-check: grep mockups for hex colors not in the token list — there must be none (team colors from the fixture excepted).

## 8. Pitfalls
- Don't "improve" legacy logic in `LEGACY_LOGIC.md` — record what it *does*, flag disagreements in `NOTES.md`.
- Don't use placeholder driver names or fake numbers in mockups; use the fixture.
- Don't start Phase 1/2 before AC6.

## 9. Hand-off
Phase 1 consumes `REF_API_CONTRACT.md v1.0`, `LEGACY_LOGIC.md`, the fixture and the benchmark result. Phase 2 consumes the approved mockups and tokens.

## 10. Kickoff prompt (copy-paste)
```
You are starting Phase 0 of the F1 Synapse web revamp.
Read, in order: docs/web-revamp/00_MASTER_PLAN.md, PHASE_0_DESIGN_AND_CONTRACT.md,
REF_API_CONTRACT.md, REF_DESIGN_SYSTEM.md. Follow the global agent rules in the
master plan section 7 strictly.

This phase is READ-ONLY on existing Python code. Do not modify any file under src/.
Work through section 4 of the phase file in order. Resolve every VERIFY item by
reading the real source and cite file:line. Build the golden fixture, run the
transport benchmark, and produce the static HTML mockups using the real tokens
and real fixture data. Stop after the mockups and ask me to approve them —
do NOT begin Phase 1. End with the required Phase report format.
```
