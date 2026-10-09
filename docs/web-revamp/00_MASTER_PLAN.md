# F1 Synapse — Web UI Revamp: Master Plan

> **Read this file first, every session.** Then read the phase file you are working on, then the two REF files.
> Version 1.0 · Owner: project author · Status tracker is at the bottom of this file.

---

## 1. Vision

Replace the two-engine GUI (Python Arcade race canvas + separate PySide6 windows) with **one cohesive, broadcast-quality web application** that runs locally. Python stays the data/ML engine; the browser becomes the entire interface.

**Why:** the current UI cannot look like one product (two toolkits, ~6 duplicated stylesheets, separate processes, flat hand-drawn HUD). Restyling it repeatedly caused overlap, duplicate-draw and missing-panel bugs. A web frontend gives GPU-accelerated rendering, real layout, real animation and a single design system.

### Goals
- One workspace: timing tower · circuit canvas · context panel · timeline.
- 60 fps smooth car motion (interpolated between the 25 Hz data frames).
- Instant scrubbing/rewind (client-owned playback clock).
- Dockable analysis panels replacing all Qt insight windows.
- ML insights shown *inline* on the track and tower, not hidden in a side window.
- A single design system (tokens) used everywhere.

### Non-goals (v1)
- Cloud hosting, accounts, multi-user.
- Live (real-time during a Grand Prix) data — replay only.
- Light theme, mobile layouts, i18n.
- Rewriting the data pipeline or retraining ML models.

---

## 2. Target architecture

```
┌──────────────────────────── Browser (or Tauri window) ─────────────────────────────┐
│  React + TypeScript                                                                │
│  ┌ Race Workspace ─────────────────────────┐  ┌ Analysis Workspace (dockview) ┐    │
│  │ Timing tower | PixiJS canvas | Context  │  │ telemetry · h2h · laps · ...  │    │
│  │ Timeline + controls                     │  └───────────────────────────────┘    │
│  └─────────────────────────────────────────┘                                       │
│  engine/: PlaybackClock · FrameStore (chunk cache + interpolation) · stores        │
└───────────────▲───────────────────────────────────────────────▲────────────────────┘
                │ HTTP: JSON + binary frame chunks               │ SSE: load progress
┌───────────────┴───────────────────────────────────────────────┴────────────────────┐
│ FastAPI on 127.0.0.1   src/web/                                                    │
│  routers → services → EXISTING pipeline (f1_data.py, ML models, Bayesian model)    │
│  computed_data/ (pickles, columnar chunks, ML timelines)    .fastf1-cache          │
└────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Key decisions (recorded; change only via `DECISIONS.md` in Phase 0)

| # | Decision | Why | Alternative rejected |
|---|----------|-----|----------------------|
| D1 | **Client-owned playback clock.** Server is stateless; it serves data, the browser plays it. | Instant scrub/rewind, smooth interpolation, no socket jitter, simpler server. | Server streams 25 Hz over WebSocket (current TCP design). |
| D2 | **Binary columnar frame chunks** (60 s each, immutable, cacheable). | ~22 M numbers per race; JSON would be huge and slow. | Per-frame JSON; whole race in one file. |
| D3 | **PixiJS v8, imperative renderer** owned by one React component via ref. | WebGL 2D, trails/glow cheap on integrated GPUs, full control, zero React re-render at 60 Hz. | Canvas2D (slower with glow/trails); `@pixi/react`; three.js. |
| D4 | **Precompute events and ML timelines at session load.** | Replay data is static; no per-frame inference needed. | Run models live per frame in the browser/server. |
| D5 | **Strangler migration.** Legacy Arcade/Qt app is untouched and runnable until Phase 10. | Always have a working app for demo/black book. | Big-bang rewrite. |
| D6 | **Tailwind + CSS-variable tokens, Radix primitives, dockview, uPlot, Motion, lucide.** | Consistent, accessible, fast; dockview gives docking, presets, popout. | Hand-rolled docking/charts. |
| D7 | **TypeScript types generated from FastAPI OpenAPI.** | One source of truth; contract drift becomes a compile error. | Hand-written duplicate types. |
| D8 | **Local only.** Bind `127.0.0.1`, validate `Host` header, no auth. | Desktop tool; avoids DNS-rebinding risk. | Binding `0.0.0.0`. |
| D9 | **Dark theme only** in v1. | Matches pit-wall aesthetic; halves design/QA surface. | Light + dark. |
| D10 | **Original branding** ("F1 SYNAPSE" wordmark). No official F1 logo or proprietary fonts. | Trademark/licensing safety. | Using F1 logo/Formula1 font. |

---

## 4. Repository layout (additions only)

```
repo/
  main.py                    # gains --web flag (Phase 1)
  src/
    f1_data.py ...           # pipeline: UNCHANGED (wrapped, never forked)
    web/                     # NEW backend (Phase 1)
      app.py  config.py  jobs.py
      routers/  services/  schemas/
    ml/                      # NEW Qt-free ML features + inference (Phase 7)
  web/                       # NEW frontend (Phase 2+)
    src/{app,design,engine,render,features,api,stores,utils}
    e2e/  fixtures/
  tests/web/                 # backend tests
  docs/web-revamp/           # THESE FILES
    DECISIONS.md  NOTES.md   # created in Phase 0, appended every phase
```

---

## 5. Phase index

| Phase | File | Size | Depends on | Output |
|-------|------|------|------------|--------|
| 0 | `PHASE_0_DESIGN_AND_CONTRACT.md` | M | — | Verified contract, approved mockups, fixture, benchmarks |
| 1 | `PHASE_1_BACKEND_API.md` | L | 0 | FastAPI service serving all session data |
| 2 | `PHASE_2_FRONTEND_FOUNDATION.md` | L | 0, 1 | App shell, design system, playback engine |
| 3 | `PHASE_3_TRACK_CANVAS.md` | L | 2 | PixiJS circuit renderer |
| 4 | `PHASE_4_TIMING_TOWER_AND_HUD.md` | L | 2, 3 | Tower, driver panel, race strip |
| 5 | `PHASE_5_TIMELINE_AND_EVENTS.md` | M | 3, 4 | Event timeline, key moments, controls, shortcuts |
| 6 | `PHASE_6_ANALYTICS_PANELS.md` | L | 5 | Dockable analysis workspace |
| 7 | `PHASE_7_ML_INTEGRATION.md` | L | 5, 6 | Inline ML overlays + explainability |
| 8 | `PHASE_8_HOME_QUALI_SETTINGS.md` | M | 2 | Home, qualifying, settings |
| 9 | `PHASE_9_POLISH_PERF_A11Y.md` | M | 3–8 | Motion, perf, accessibility, export |
| 10 | `PHASE_10_PACKAGING_AND_CUTOVER.md` | M | all | Single-command launch, legacy removal, docs |

**Shared references:** `REF_API_CONTRACT.md`, `REF_DESIGN_SYSTEM.md`.

**Minimum demo path (if time is short):** Phases 0 → 5 give a complete, impressive race replay. Add Phase 7 (ML) for the headline feature. Phases 6, 8, 9, 10 can follow.

---

## 6. Legacy → new parity matrix

Nothing in the legacy app may be deleted until its row is ✅ and Phase 10 is run.

| Legacy component | New home | Phase | Status | Evidence |
|---|---|---|:---:|---|
| `F1RaceReplayWindow` canvas, camera, track ribbon, DRS zones | PixiJS canvas | 3 | ✅ | `docs/web-revamp/evidence/phase-3/track-full-1920x1080.png` |
| `draw_finish_line` | Canvas finish-line layer | 3 | ✅ | `docs/web-revamp/evidence/phase-3/track-full-1920x1080.png` |
| Safety Car drawing (glow, trail, SC/VSC label) | Canvas SC layer | 3 | ✅ | `docs/web-revamp/evidence/phase-3/driver-follow-1920x1080.png` |
| `LeaderboardComponent` (I/L gaps, DNF/PIT/OUT, tyre icons, click-select) | Timing tower | 4 | ✅ | `docs/web-revamp/evidence/phase-4/tower-leader-gaps.png` |
| `WeatherComponent` | Race-strip weather chip + popover | 4 | ✅ | `docs/web-revamp/evidence/phase-4/workspace-1920x1080-t60.png` |
| `SessionInfoComponent` | Race strip | 4 | ✅ | `docs/web-revamp/evidence/phase-4/workspace-1920x1080-t60.png` |
| `DriverInfoComponent` (speed, gear, DRS, gaps, tyre bar, multi-select) | Context panel driver cards | 4 | ✅ | `docs/web-revamp/evidence/phase-4/two-driver-compare.png` |
| `RaceProgressBarComponent` | Event timeline | 5 | ✅ | `docs/web-revamp/evidence/black-book/race-workspace-hero.png` |
| `RaceControlsComponent` | Transport controls | 5 | ✅ | `docs/web-revamp/evidence/black-book/race-workspace-hero.png` |
| `LegendComponent`, `ControlsPopupComponent` | Shortcuts overlay + command palette | 5 | ✅ | `docs/web-revamp/evidence/phase-5/` |
| `InsightsMenu` | Analysis workspace panel launcher | 6 | ✅ | `docs/web-revamp/evidence/black-book/analysis-race-engineer.png` |
| `driver_telemetry_window` | Telemetry panel | 6 | ✅ | `docs/web-revamp/evidence/black-book/analysis-race-engineer.png` |
| `track_position_window` | Track-position strip panel | 6 | ✅ | `docs/web-revamp/evidence/black-book/analysis-race-engineer.png` |
| `lap_time_chart_window` | Lap & gap panel | 6 | ✅ | `docs/web-revamp/evidence/black-book/analysis-strategist.png` |
| `tyre_strategy_window` | Tyre strategy panel | 6 | ✅ | `docs/web-revamp/evidence/black-book/analysis-strategist.png` |
| `race_control_feed_window` | Race control panel | 6 | ✅ | `docs/web-revamp/evidence/black-book/analysis-strategist.png` |
| `telemetry_stream_viewer` | Dev-only debug overlay | 6 | ✅ | `docs/web-revamp/evidence/phase-3/fps-overlay-1920x1080.png` |
| `ml_prediction_window` | Inline overlays + ML panel | 7 | ✅ | `docs/web-revamp/evidence/black-book/battle-ml-chips.png` |
| `RaceSelectionWindow` | Home screen | 8 | ✅ | `docs/web-revamp/evidence/black-book/home-calendar.png` |
| `QualifyingReplay` + 3 qualifying components | Qualifying view | 8 | ✅ | `docs/web-revamp/evidence/black-book/qualifying-results.png` |
| `SettingsDialog` | Settings page | 8 | ✅ | `docs/web-revamp/evidence/black-book/settings.png` |
| `TelemetryStreamServer` (TCP 9999) | FastAPI stream & binary chunks | 10 | ✅ | `src/web/routers/sessions.py` |

**Keyboard parity (100% verified):**
- `SPACE`: Play / pause toggle (`RaceWorkspace.tsx:230`) — ✅
- `←/→`: Step ±10s; `Shift + ←/→`: Step lap (`RaceWorkspace.tsx:234-246`) — ✅
- `↑/↓`: Halve / double playback rate (`RaceWorkspace.tsx:250-256`) — ✅
- `1–4`: Direct speed preset (1x, 2x, 4x, 8x) (`RaceWorkspace.tsx:259-274`) — ✅
- `R`: Restart from lap 1 (`RaceWorkspace.tsx:275`) — ✅
- `D`: Toggle DRS detection zones (`RaceWorkspace.tsx:278`) — ✅
- `B`: Toggle progress bar (`RaceWorkspace.tsx:281`) — ✅
- `L`: Cycle driver labels (`RaceWorkspace.tsx:284`) — ✅
- `H` / `?`: Shortcuts & help modal (`RaceWorkspace.tsx:290`) — ✅
- `P`: Export PNG snapshot (`RaceWorkspace.tsx:296`) — ✅
- `Ctrl+K`: Command palette (`RaceWorkspace.tsx:202`) — ✅
- `Esc`: Clear driver selection / close modal (`RaceWorkspace.tsx:209`) — ✅

---

## 7. Global rules for the AI agent (apply to EVERY phase)

These exist because earlier GUI passes failed in specific ways (duplicate leaderboards, missing panels, placeholder `--` values, unidentified UI elements).

1. **Read first.** Master plan + current phase file + both REF files before writing code.
2. **Verify, don't assume.** Field names, file paths and function names in these docs marked `VERIFY` must be confirmed by reading the source. Report discrepancies; don't silently pick one.
3. **Stay in scope.** If you notice something out of scope, append it to `docs/web-revamp/NOTES.md` and continue.
4. **Replace = delete.** When a new component supersedes an old one *inside the web app*, delete the old one in the same change. No dead or duplicate components.
5. **Never fork the data pipeline.** Wrap `f1_data.py`; do not copy its logic. **Position = sort by cumulative `dist` descending.** Never reintroduce a `(lap, dist)` sort (this caused the earlier leaderboard bug). Keep the golden test for this.
6. **No fake data in real paths.** Loading/empty/error states must be explicit. Never ship `--` or `0` placeholders wired to nothing.
7. **Real data before polish.** Wire real data first, style second.
8. **No work at 60 Hz in React.** The playhead lives outside React state. No allocations inside the render loop (preallocated typed arrays).
9. **Evidence or it didn't happen.** "Done" means: tests passing (paste output), Playwright screenshots saved in `docs/web-revamp/evidence/phase-N/`, each acceptance criterion ticked with proof.
10. **Branch + small commits.** Branch `web/phase-N-<slug>`. Conventional commit messages.
11. **Undecided? Choose the simplest option consistent with this plan,** record it in `DECISIONS.md`, flag it in your final report.
12. **Branding.** Original wordmark only; no F1 logo, no proprietary fonts. Self-host all fonts (app must work offline).

### Required final report format (end of every phase)
```
## Phase N report
- Done: …
- Acceptance criteria: [x] AC1 (evidence: path/test) …
- Deviations from the plan: …
- New decisions (added to DECISIONS.md): …
- Out-of-scope findings (added to NOTES.md): …
- Open questions for the owner: …
```

---

## 8. Risk register

| Risk | Impact | Mitigation |
|---|---|---|
| Frame data too large/slow over HTTP | Laggy scrubbing | Phase 0 benchmark; columnar float32 + gzip; 60 s chunks; prefetch |
| PixiJS slow on Intel UHD (dev machine class: integrated GPU, 16 GB RAM) | Choppy canvas | Perf budget in Phase 3; "performance mode" in Phase 8/9 |
| FastF1 loads are slow / API unavailable | Poor first-run | Progress UI; offline-from-cache mode; fixture session for dev |
| ML models trained on synthetic targets | Misleading confidence | Label as "Estimated"; model-card popover (Phase 7) |
| Scope creep / agent drift | Missed deadline | Strict phase gates; `NOTES.md` for out-of-scope ideas |
| Black-book deadline | Incomplete migration | Minimum demo path (Phases 0–5); legacy stays runnable until Phase 10 |

---

## 9. Progress tracker (update after each phase)

- [x] Phase 0 — Design & contract (**owner must approve mockups: `DESIGN_APPROVED`**)
- [x] Phase 1 — Backend API
- [x] Phase 2 — Frontend foundation
- [x] Phase 3 — Track canvas
- [x] Phase 4 — Timing tower & HUD
- [x] Phase 5 — Timeline & events
- [x] Phase 6 — Analytics panels
- [x] Phase 7 — ML integration
- [x] Phase 8 — Home, qualifying, settings
- [x] Phase 9 — Polish, perf, accessibility
- [x] Phase 10 — Packaging & cutover
