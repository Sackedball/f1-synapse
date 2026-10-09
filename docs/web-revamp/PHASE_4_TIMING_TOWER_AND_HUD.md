# Phase 4 — Timing Tower & HUD

> **Size:** L · **Depends on:** Phases 2, 3 · **Branch:** `web/phase-4-tower-hud`

## 1. Goal
Build the information panels around the canvas: a broadcast-style **timing tower** with animated position changes, a **context panel** with rich driver cards (including multi-select/compare that fixes the legacy overflow bug), and a **race strip** (session info, lap/time, flag state, weather). Together with Phase 3 this is the full "Race Workspace" look from the approved mockup.

## 2. Scope
**In:** `TimingTower`, `ContextPanel` (driver cards, compare layout, race summary when nothing selected), `RaceStrip` (title, lap, race time, flag pill, weather chip + popover, playback-rate indicator), selection wiring to the canvas, tests.
**Out:** timeline & transport (Phase 5), analytics panels (Phase 6), ML chips (Phase 7 — leave slots).

## 3. Tasks

### 3.1 Timing tower (replaces legacy `LeaderboardComponent`)
- [ ] Row layout (per mockup): `pos` · team color bar (4 px) · `code` (bold) · `gap` · `tyre` (TyreBadge + age) · `status`. Row height 36 px (comfortable) / 29 px (compact).
- [ ] **Gap column** with the legacy **Interval / Leader** toggle (`I`/`L` header buttons). Values from `gapAhead`/`gapLeader` (already server-computed, parity-tested). Formatting per design system (`+3.4`, `+0.812`, `LAP +1` for lapped, `—` for leader).
- [ ] **Status badges:** `PIT` (in pit lane), `OUT`/`DNF` (retired), grid/not-started. Retired drivers sink to the bottom, greyed, in order of retirement.
- [ ] **Fastest lap** purple badge on the holder's row (from `/laps` or events when available; if not available yet, leave the slot and note in `NOTES.md`).
- [ ] **Position change animation:** FLIP translateY over `--dur-slow` with `--ease-out`; green ▲ / red ▼ flash for 2 s on rows that gained/lost places (ignore changes caused purely by pit-stop sequencing if the position diff is ≥ 2 in one tick — still animate, but don't flash). Throttle the tower's data to ~10 Hz via `useSnapshotSelector`.
- [ ] **Interaction:** click selects (updates `selectionStore`, canvas highlights), shift/ctrl+click toggles compare (max 4), hover syncs with canvas hover (both directions). Keyboard: `↑/↓` move focus, `Enter` select, `Esc` clear.
- [ ] Table semantics (`role="table"`/`row`/`cell`) with `aria-selected`.
- [ ] Header shows lap counter mini-display only if the race strip is hidden at small widths.

### 3.2 Context panel (replaces legacy `DriverInfoComponent`)
- [ ] **No selection →** race summary card: leader, fastest lap, flag state, pit-stop count, retirements (data available now: from snapshot/meta; leave a slot for "Key moments" in Phase 5).
- [ ] **One driver →** full driver card:
  - Header: team bar, code, full name, team, current position badge.
  - Speed (large number + arc `Gauge`), gear, DRS pill (off/eligible/open).
  - Throttle and brake `StatBar`s (green/red, vertical like legacy).
  - Tyre: compound badge, age, wear bar (use tyre-life vs typical stint length now; Phase 7 swaps in the Bayesian degradation estimate with the "est." treatment).
  - Gaps: **Ahead** `+x.xxx (CODE)` and **Behind** `−x.xxx (CODE)` with driver chips, `N/A` when none.
  - Current lap number and a 30-second speed `Sparkline` (via `getSeries`).
- [ ] **Two drivers (compare) →** side-by-side cards sharing a center column of deltas (gap, speed Δ, tyre age Δ).
- [ ] **3–4 drivers →** one expanded card + compact list rows (never drops below the visible area; scroll inside the panel if needed). This resolves the legacy "cards disappear below 720p" issue.
- [ ] Panel collapses to a rail at 1280–1599 px (design system breakpoints); drawer below 1280.

### 3.3 Race strip (replaces `SessionInfoComponent` + `WeatherComponent` + top-left HUD text)
- [ ] Left: wordmark. Center: event name, circuit, round, date. Right: `LAP 23/53` (display font, tabular), race time `HH:MM:SS`, playback-rate chip (`1×`).
- [ ] **FlagPill:** GREEN / YELLOW / RED / SC / VSC with color + text (never color only); pulses subtly (disabled under reduced-motion); announces changes via `aria-live`.
- [ ] **Weather chip:** air temp + icon; click opens a Popover with track temp, air temp, humidity, wind speed/direction arrow, rain state. Data from `/weather` sampled at the current `t`.
- [ ] Hide-on-demand: `B`/UI toggle behaviour parity is handled in Phase 5; here just expose `uiStore` flags.

### 3.4 Selection wiring
- [ ] Single `selectionStore` is the only source of truth; tower, canvas, context panel all react to it. Add UI button "Focus" that toggles `renderer.setFocus`.
- [ ] Persist nothing about selection across sessions (state is session-scoped).

### 3.5 Tests
- [ ] Unit: gap formatter (leader, <1 s, ≥1 s, lapped, NaN), sorting with retirements, FLIP-trigger logic, compare-list rules (max 4, replace-oldest or block — choose and document).
- [ ] Component tests (Vitest + Testing Library): tower renders 22 rows in `position` order from a fixed snapshot; I/L toggle swaps values; selection events fire; keyboard navigation.
- [ ] Playwright: on the fixture at T+60 s, screenshots of the full workspace at 1366×768, 1920×1080, 2560×1440; assert no element overlap (script that checks bounding boxes of the named regions don't intersect) and no horizontal scrollbar.

## 4. Files
**Create:** `web/src/features/{timing-tower,context-panel,race-strip}/**`.
**Modify:** `RaceWorkspace` (slots → real components), `uiStore`, `selectionStore`.
**Delete:** Phase 2 placeholders for tower, context panel, top strip (replace = delete).

## 5. Acceptance criteria
- [ ] AC1: Tower order always equals the server `position` order (test + visual check against canvas order at 5 sampled times).
- [ ] AC2: Overtakes animate smoothly; no layout jank; ▲/▼ flashes appear and clear after 2 s.
- [ ] AC3: I/L toggle matches legacy behaviour on 5 sampled frames (compare against `LEGACY_LOGIC.md` expectations).
- [ ] AC4: PIT/OUT/DNF rendering correct on a window containing a pit stop and (if present) a retirement; retired cars sink and grey out.
- [ ] AC5: Selecting a driver in the tower highlights it on the canvas and vice-versa; hover syncs both ways.
- [ ] AC6: Compare with 1, 2, 3, 4 drivers works at 1366×768 with no clipped/overlapping cards.
- [ ] AC7: Race strip shows live lap/time, flag pill changes with `trackStatus`, weather popover shows values for current `t`.
- [ ] AC8: Workspace matches the approved mockup at the 3 viewports; overlap script reports none.
- [ ] AC9: Keyboard navigation + ARIA table semantics verified (axe check on the workspace: no critical violations).
- [ ] AC10: No re-render storms (Profiler: tower/panels update ≤ 10 Hz).

## 6. Verification
Screenshots, overlap-check output, axe report, test output in `evidence/phase-4/`.

## 7. Pitfalls
- Don't recompute positions client-side — use `position`/`orderByPosition`.
- Don't render rows from React state that updates 60 Hz; throttle selectors.
- FLIP needs stable keys (driver code), not index keys.
- Wind direction: confirm degrees convention (from → to) from Phase 0 notes.
- Placeholder strings like `--` must not ship wired to nothing; show real values or an explicit "No data".

## 8. Hand-off
Phase 5 attaches the timeline/transport beneath; Phase 6 reuses the driver chips, gauges, sparklines; Phase 7 fills the reserved ML slots (tower "PIT %" chip, driver-card "est. wear", battle card).

## 9. Kickoff prompt (copy-paste)
```
You are starting Phase 4 (Timing Tower & HUD) of the F1 Synapse web revamp.
Read: 00_MASTER_PLAN.md, PHASE_4_TIMING_TOWER_AND_HUD.md, REF_DESIGN_SYSTEM.md,
LEGACY_LOGIC.md, the approved mockups. Phases 2 and 3 must be complete.

Build the TimingTower, ContextPanel (driver/compare/summary) and RaceStrip using
real snapshot data and the design-system components. Use server-provided position
and gaps (never recompute). Animate position changes with FLIP. Fix the legacy
multi-driver overflow with the compare layout. Replace the Phase 2 placeholders
(delete them). Verify no overlaps at 1366x768/1920x1080/2560x1440 with a bounding-box
script and run an axe accessibility check. End with the Phase report and evidence.
```

---

## 10. Visual Elevation Addendum (v1.1 Art Direction)

*Established in Phase 3.5 to preserve broadcast visual polish across all HUD and side-panel components.*

### 10.1 Timing Tower Typography & Geometry
- **Driver Codes:** Display face (`Titillium Web`, 15px bold, letter-spacing `0.04em`, uppercase).
- **Position Numbers:** Tabular numeric (`JetBrains Mono`, 13px bold, `--text-2`).
- **Gap & Lap Displays:** Tabular numerals everywhere numeric (`JetBrains Mono`, 13px tabular-nums).
- **Column Headers & Micro Labels:** Small-caps micro styling (`Inter`, 11px uppercase, tracking `+0.06em`, font-semibold, `--text-3`).
- **Row Heights:** 36px comfortable (default for standard viewports); 30px compact (applied automatically when viewport height $\le 900$px or car count $> 20$).
- **Team Color Indicator:** 4px solid team color bar with 1px border separation between bar and driver code.
- **Row Separators & Highlights:** 1px discrete divider (`--border`) with a 1px top highlight line (`--border-hi`) on active/hovered rows.
- **Gap Formatting Standards:**
  - Leader row: `"LEADER"` or `"—"` (`--text-3`).
  - Interval $< 1.0$s: `"+0.xxx"` (three decimal precision, e.g. `+0.342`).
  - Interval $\ge 1.0$s: `"+x.x"` (one decimal precision, e.g. `+2.8`).
  - Lapped cars: `"+n LAPS"` (e.g. `"+1 LAP"` or `"+2 LAPS"` in `--text-3`).

### 10.2 Context Panel & Driver Cards
- **Card Background & Elevation:** Base cards on `--surface-2` with a crisp 1px top/inner highlight line (`--border-hi`), separating cleanly from the `--surface-1` app shell.
- **Sub-panels & Embedded Sections:** Recessed telemetry sub-panels on `--surface-1` with 1px `--border` strokes.
- **Driver Avatar / Identification:** Driver photo/avatar slot framed with a 2px team-color accent ring and small position rank badge.
- **Telemetry Gauges & Stat Bars:** Circular gauge arcs use a subtle `--border` track stroke with team/accent fill; throttle and brake vertical stat bars use `--traffic-green` and `--traffic-red` respectively.
- **Multi-Car Comparison Layout:**
  - Side-by-side cards on desktop viewports ($\ge 1600$px) sharing a synchronized central delta column (speed $\Delta$, gap $\Delta$, tyre age $\Delta$).
  - Vertical accordion layout on compact/medium screens ($< 1600$px) to prevent vertical overflow and clipping.

