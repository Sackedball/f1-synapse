# Phase 6 — Analytics Panels (Analysis Workspace)

> **Size:** L · **Depends on:** Phase 5 · **Branch:** `web/phase-6-analytics`

## 1. Goal
Replace every Qt "pit wall" window with a **dockable panel** inside one **Analysis Workspace** (dockview): drag, split, tab, float, save/restore layouts, optionally pop out to another monitor. Add the new **head-to-head** analysis. All panels read the same playback clock, so they stay perfectly in sync with the race view.

## 2. Scope
**In:** dockview workspace, panel registry + launcher, 7 panels, layout presets (persisted/exportable), chart sync, tests.
**Out:** ML panel (Phase 7), qualifying charts (Phase 8, reuse the chart primitives built here).

## 3. Architecture
- Route/tab "Analysis" next to "Race". Panels are React components registered in a `panelRegistry` (id, title, icon, default size, component). The same registry feeds the palette command "Open panel …" and the launcher menu (replaces `InsightsMenu`).
- Panels subscribe to the clock/`FrameStore` through the Phase 2 hooks (throttled 5–10 Hz); time-series come from `FrameStore.getSeries(...)` (no allocation) or REST data cached by TanStack Query.
- Charts use **uPlot** (fast, small). Shared design-system chart theme; shared **cursor/time sync**: hovering a chart moves a marker on all time-based charts, clicking seeks the clock.
- Panel state (selected drivers per panel) defaults to following the global `selectionStore` but can be "pinned".

## 4. Tasks

### 4.1 Workspace shell
- [ ] Add `dockview`; build `AnalysisWorkspace` with the app's dark theme applied through tokens (no default dockview colors leaking).
- [ ] Launcher menu + palette commands to add/remove panels; panels can be closed/reopened without losing state.
- [ ] **Layout presets:** `Race Engineer`, `Strategy`, `Telemetry`, `Broadcast (clean)`; "Save current layout as…", rename, delete, **export/import JSON**; persisted in `localStorage` (via `settingsStore`); migration-safe (unknown panel ids ignored).
- [ ] **Pop-out** a panel to a separate browser window (dockview popout) — **stretch**: verify that clock subscriptions and styles work in the popout; if not feasible, document in `NOTES.md` and ship without it.

### 4.2 Chart primitives (`features/analytics/charts/`)
- [ ] `TimeSeriesChart` (uPlot wrapper): team-colored lines, shared cursor, click-to-seek, "now" playhead line, event markers (pit, SC bands) from `/events`, auto y-range, resize-aware, destroy-safe.
- [ ] `DistanceChart` (x = lap distance) for h2h/lap comparisons.
- [ ] `Gantt` (SVG) for stints; `PositionStrip` (Canvas/SVG) for linear track position.

### 4.3 Panels (each replaces a legacy window)
1. **Driver Telemetry** (← `driver_telemetry_window`): speed, gear, throttle/brake strip charts for the selected driver; modes: *last 30 s* or *current lap by distance*; follows selection.
2. **Head-to-Head** (new): choose two drivers (default: selected pair or P1/P2). Overlaid speed/throttle/brake vs distance for the current lap (or a chosen lap each), **delta-time** trace, gap-over-time chart; corner labels on the distance axis; "who's faster where" summary (mini-sector winners).
3. **Lap Times & Gaps** (← `lap_time_chart_window`): lap-time chart for selected drivers with PB/fastest highlights and pit laps marked; gap-to-leader / gap-to-car-ahead evolution; toggle to hide in/out laps and SC laps (outlier filter); pace-distribution mini box-plot.
4. **Tyre Strategy** (← `tyre_strategy_window`): Gantt of every driver's stints (compound colors + letters, lap ranges), current-lap marker, pit-stop count, projected window highlights (data-only for now; ML later). **Computed from session data per load — do not read or write `tyre_state.json`.**
5. **Race Control Feed** (← `race_control_feed_window`): chronological messages with flag-colored chips, driver chips, filters (flags / incidents / penalties), auto-scroll "live" mode that follows the clock, click → seek.
6. **Track Position Strip** (← `track_position_window`): linear representation of the lap (0–100 %) with all cars as team-colored markers, sector separators, cluster/gap visualisation, hover = driver + gap.
7. **Debug / Stream Inspector** (← `telemetry_stream_viewer`, **dev builds only**): current `Snapshot` as a table, chunk cache state, fetch timings, FPS/clock info.

### 4.4 Backend additions (only if missing)
- [ ] Verify `/laps`, `/stints`, `/race-control`, `/events` expose everything the panels need (lap time, sectors, compound, tyre life, pit flags, SC lap flag). Add missing fields with contract version bump + type regeneration.
- [ ] Optional: `/api/sessions/{sid}/lap/{driver}/{lap}/telemetry` if the h2h panel needs historical laps beyond the frame store window (otherwise use `getSeries`, which already spans the whole race).

### 4.5 Tests
- [ ] Unit: delta-time computation (sample on distance grid, interpolation, sign convention), outlier filter, stint-to-Gantt transform, layout serialisation round-trip (+ unknown-panel tolerance).
- [ ] Component: each panel renders with fixture data without errors; empty/loading/error states present.
- [ ] Playwright: open the 4 presets; add/remove panels; chart click seeks the clock; layout export → reload → import restores identical layout; screenshots of each preset at 1920×1080.

## 5. Files
**Create:** `web/src/features/analytics/**` (workspace, charts, panels, registry, presets).
**Modify:** router (Analysis tab), palette commands, `settingsStore`, backend schemas if needed.
**Delete:** nothing in web; **do not delete legacy Qt windows yet** (Phase 10).

## 6. Acceptance criteria
- [ ] AC1: Every legacy insight window in the parity matrix has a working panel equivalent (table in the report mapping each).
- [ ] AC2: Panels stay in sync with the race clock within one frame; chart cursors sync across panels; clicking a chart seeks.
- [ ] AC3: Presets load correctly; custom layouts persist across reload; export/import round-trips.
- [ ] AC4: Head-to-head delta sign convention is documented on-screen (`+` = first driver slower) and verified on a known pair by a manual spot-check (evidence).
- [ ] AC5: Tyre strategy matches `/stints` and shows correct compounds from lap 1 even when a previous session was viewed (no stale-state bug).
- [ ] AC6: With all 7 panels open and playing at 4×, the canvas workspace stays ≥ 55 fps (or, if panels are in a separate tab, the Analysis tab stays ≥ 30 fps with no memory growth over 5 minutes).
- [ ] AC7: No panel allocates per frame (Profiler/heap evidence for the two heaviest panels).
- [ ] AC8: Styling uses tokens only (grep evidence); dockview chrome matches the design system.

## 7. Verification
Screenshots of each panel and preset, perf traces, test outputs → `evidence/phase-6/`.

## 8. Pitfalls
- uPlot instances must be destroyed on unmount; resize via `ResizeObserver`, not window events.
- Don't push full-race arrays into React state — keep them in typed arrays, hand to uPlot directly.
- h2h on different laps/lengths: normalise by lap distance fraction, not time.
- Dockview layouts reference component ids — keep ids stable; version the serialized layout.
- Hidden (unmounted/background) panels should pause their updates.

## 9. Hand-off
Phase 7 adds the ML panel and ML overlays using the same registry and chart primitives. Phase 8 reuses `DistanceChart` for qualifying.

## 10. Kickoff prompt (copy-paste)
```
You are starting Phase 6 (Analytics Panels) of the F1 Synapse web revamp.
Read: 00_MASTER_PLAN.md (parity matrix!), PHASE_6_ANALYTICS_PANELS.md,
REF_DESIGN_SYSTEM.md, REF_API_CONTRACT.md, LEGACY_LOGIC.md. Phase 5 must be done.

Build the dockview-based Analysis Workspace, the chart primitives (uPlot-based) and the
7 panels listed, each replacing its legacy Qt window. Keep all panels synchronised with
the global PlaybackClock and use FrameStore.getSeries (no per-frame allocation). Compute
tyre strategy from session data (never read tyre_state.json). Implement layout presets
with export/import. Do not delete legacy windows. Include a table mapping each legacy
window to its new panel in the Phase report, plus perf evidence and screenshots.
```
