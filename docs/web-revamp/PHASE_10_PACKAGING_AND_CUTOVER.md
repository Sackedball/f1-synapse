# Phase 10 — Packaging & Cutover

CUTOVER_APPROVED: 2026-10-02

> **Size:** M · **Depends on:** all previous phases · **Branch:** `web/phase-10-cutover`
> **Owner gate:** the owner signs off the parity matrix before any legacy code is deleted.

## 1. Goal
Ship it: one-command launch, production build served by the Python backend, the legacy Arcade/Qt UI safely removed, documentation and the black book updated, and a clean-machine install verified.

## 2. Scope
**In:** production build + static serving, launch scripts, optional desktop shell (stretch), parity sign-off, legacy deletion, dependency cleanup, docs (`README`, `WEB_CONTEXT.md`), black-book update list, release checklist.
**Out:** new features; cloud deployment.

## 3. Tasks

### 3.1 Production build & serving
- [ ] `npm run build` → `web/dist`. FastAPI serves it with SPA fallback, correct MIME types, gzip/brotli (pre-compressed assets if supported), long-cache headers for hashed assets, `no-cache` for `index.html`.
- [ ] `python main.py --web` (and a `--web` default decision — see §3.2) starts the server, picks a free port if busy, opens the default browser, prints the URL, and shuts down cleanly (Ctrl+C, closes worker processes — verify no orphan Python processes on Windows).
- [ ] Health/graceful degradation: if `web/dist` is missing, print a clear message ("run `npm run build` or use the release bundle").

### 3.2 Launch experience
- [ ] Add `run.bat` and `run.sh` (create venv if missing, install deps, build frontend if `dist` missing, start). Keep them simple and documented.
- [ ] **Decision to record in `DECISIONS.md`:** make web the default for `python main.py` (legacy behind `--legacy`) **or** keep legacy default until deletion. Since legacy is deleted in §3.4, web becomes the only mode; keep CLI flags (`--year --round --session`) working to deep-link into a session.
- [ ] **Stretch — desktop shell:** a Tauri (or pywebview) wrapper with the Python backend as a sidecar (PyInstaller one-folder build) for a double-click app. Only attempt if time allows; otherwise document the browser-based launch as the supported mode.

### 3.3 Parity sign-off (gate)
- [ ] Fill in the **parity matrix** from `00_MASTER_PLAN.md` with a ✅/❌ and a link to evidence for every row, plus the keyboard-parity list. Any ❌ blocks deletion (fix or get an explicit owner waiver recorded in `DECISIONS.md`).
- [ ] Owner reviews a live walkthrough (race, analysis presets, ML overlays, qualifying, home, settings) and approves: write `CUTOVER_APPROVED: <date>` at the top of this file.

### 3.4 Legacy removal (only after the gate)
- [ ] **Tag first:** `git tag legacy-final` on the last commit that still contains the Arcade/Qt UI (rollback point).
- [ ] Delete (verify each path exists before deleting; list what was removed in the report):
  - `src/interfaces/race_replay.py`, `src/interfaces/qualifying.py`
  - `src/ui_components.py`
  - `src/gui/*` Qt windows (`insights_menu`, `race_selection`, `settings_dialog`, `pit_wall_window*`)
  - `src/insights/*` Qt windows (keep any Qt-free helpers that moved to `src/ml/`)
  - `src/run_session.py` Arcade/Qt orchestration (retain only what the web launcher still uses)
  - `src/services/stream.py` TCP server/client **unless** an external consumer is documented (then keep server only, remove Qt client)
  - `computed_data/tyre_state.json` handling code
- [ ] **Keep:** `src/f1_data.py`, Bayesian tyre model, ML training scripts and models, `src/ml/`, `src/web/`.
- [ ] Remove `arcade` and `PySide6` (and any now-unused packages) from `requirements*.txt`; confirm `pip install` in a fresh venv works and the app runs.
- [ ] Remove dead imports/config/constants; run linters/tests; ensure the repo has **no references to deleted modules** (grep).

### 3.5 Documentation
- [ ] **README:** what it is, screenshots (from the capture script), install (Python + Node), run (`run.bat`/`run.sh`, `python main.py --web`), dev workflow (backend + Vite), tests, project structure, data attribution (FastF1/official timing data) and the ML caveat.
- [ ] **`docs/WEB_CONTEXT.md`** — the new standing reference replacing `GUI_CONTEXT.md` (same structure: what it is, architecture map with file paths, design system pointer, known issues, how to verify a change, open questions). Generate it by *reading the final code*, not from these plan files. Archive `GUI_CONTEXT.md` as `docs/legacy/GUI_CONTEXT_legacy.md`.
- [ ] Update `docs/web-revamp/00_MASTER_PLAN.md` tracker to complete; keep the phase files as history.
- [ ] **Black book update list** (write `docs/BLACK_BOOK_UPDATES.md`): every section that mentions Arcade/Pyglet/PySide6/60 FPS windows/TCP stream must be revised — Implementation (Presentation Tier, System Architecture, Graphics pipeline, Streaming architecture), Data Interpretation (Pit Wall suite → Analysis Workspace + inline ML), figures (replace with captures from `evidence/black-book/`), tech-stack tables, and conclusion/future scope. Provide updated paragraph text where practical.

### 3.6 Release checklist (clean-machine test)
- [ ] On a clean machine/VM (or fresh user profile): clone → follow README only → app runs with a cached fixture session; then load a real session end-to-end.
- [ ] Works **offline** with cached data; fonts/assets local.
- [ ] Windows primary; run a smoke test on macOS/Linux if available, note results.
- [ ] Version number set (`0.1.0` or per owner), changelog entry, tag `v<version>`.
- [ ] Final full test run: backend pytest, frontend Vitest, Playwright e2e + visual, soak.

## 4. Files
**Create:** `run.bat`, `run.sh`, `docs/WEB_CONTEXT.md`, `docs/BLACK_BOOK_UPDATES.md`, changelog.
**Modify:** `main.py`, backend static serving, README, requirements.
**Delete:** legacy UI per §3.4.

## 5. Acceptance criteria
- [ ] AC1: Parity matrix 100 % ✅ (or waivers recorded); `CUTOVER_APPROVED` present.
- [ ] AC2: Tag `legacy-final` exists before deletion; deletion list in report matches reality; grep finds no references to removed modules.
- [ ] AC3: Fresh venv install without `arcade`/`PySide6` succeeds; `python main.py --web` (or default) opens the app and a session plays.
- [ ] AC4: Clean-machine test passes using README alone (steps + timings recorded).
- [ ] AC5: No orphan Python/worker processes after closing (Task Manager evidence) and graceful shutdown works.
- [ ] AC6: `WEB_CONTEXT.md` generated from final code and accurate (spot-check 5 file/line references).
- [ ] AC7: `BLACK_BOOK_UPDATES.md` complete with replacement text for the key sections and a list of new figures.
- [ ] AC8: All test suites green (paste summary).

## 6. Verification
Outputs of the final test run, clean-machine log, process list, deletion list, grep results → `evidence/phase-10/`.

## 7. Pitfalls
- Deleting before the gate — never.
- Leaving `arcade`/`PySide6` in requirements "just in case" (confuses installs and the black book).
- Windows: port already in use, antivirus blocking the browser launch, worker processes surviving Ctrl+C.
- Docs generated from the plan instead of the code — verify every path/name.

## 8. Hand-off
Project complete. Future work lives in `NOTES.md` (ideas backlog): live-session mode, sprint weekends, multi-session compare, shareable clips, desktop installer.

## 9. Kickoff prompt (copy-paste)
```
You are starting Phase 10 (Packaging & Cutover) of the F1 Synapse web revamp.
Read: 00_MASTER_PLAN.md (parity matrix), PHASE_10_PACKAGING_AND_CUTOVER.md,
DECISIONS.md, NOTES.md. All previous phases are complete.

Step 1: production build + static serving + launch scripts. Step 2: fill the parity
matrix with evidence and STOP for owner approval (CUTOVER_APPROVED) before deleting
anything. Step 3 (only after approval): tag legacy-final, delete the legacy Arcade/Qt
UI and unused dependencies, grep for dangling references. Step 4: README, WEB_CONTEXT.md
(generated by reading the final code), BLACK_BOOK_UPDATES.md. Step 5: clean-machine
install test and the full test run. Finish with the Phase report and evidence.
```
