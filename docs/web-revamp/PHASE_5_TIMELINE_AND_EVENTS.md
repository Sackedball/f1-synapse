# Phase 5 — Timeline, Events & Controls

> **Size:** M · **Depends on:** Phases 3, 4 · **Branch:** `web/phase-5-timeline`

## 1. Goal
Replace the plain progress bar with an **event timeline** (pit stops, overtakes, flags, safety cars, retirements, fastest laps, battles) you can scrub and click, add **Key Moments** navigation, finalise the transport controls, and restore all keyboard shortcuts plus a command palette. This phase completes the **minimum demo path**.

## 2. Scope
**In:** backend event detection + `/events`, timeline component, key-moments drawer, transport controls, shortcuts overlay, command palette, tests.
**Out:** ML-derived events (Phase 7 may add "high overtake probability" markers), analytics panels (Phase 6).

## 3. Tasks

### 3.1 Backend — event detection (`src/web/services/events_service.py`)
Detect from the already-loaded session data; run once at load (stage `indexing_events`), cache with the session. All thresholds live in one `EventConfig` dataclass with defaults and are unit-tested.

- [ ] **Flags / SC / VSC / red flag:** contiguous `trackStatus` runs → `flag`/`safety_car`/`vsc` events with `t`/`tEnd`, lap, label.
- [ ] **Pit stops:** `inPit` rising/falling edges per driver → `pit_in` / `pit_out` (pair them; include stop duration in `meta` if derivable) with compound change from stints.
- [ ] **Retirements:** driver `status` transitions to out → `retirement` (use lap/time from data).
- [ ] **Overtakes (on-track):** A overtakes B when `position` order of the pair flips and the flip is **stable** for ≥ `overtakeStableSec` (default 3 s), neither driver was in the pit lane during the window, and the flip is not explained by the other car pitting/retiring. Debounce flip-flops. Ignore the first `startIgnoreSec` (default 8 s) of the race (grid shuffle) but keep a single `start` event.
- [ ] **Position changes via pit:** not reported as overtakes.
- [ ] **Fastest lap:** from laps data → `fastest_lap` events (each time the overall fastest improves).
- [ ] **Battles:** a pair within `battleGapSec` (default 1.0 s) for ≥ `battleMinSec` (default 15 s), merged into one event with `t`/`tEnd`.
- [ ] **Race control incidents/penalties:** map from race-control messages (investigation, penalty, collision) with drivers parsed from the message when possible.
- [ ] `severity`: flags/SC/red/retirement = major; overtakes for position ≤ P5 and fastest laps = major; others info/minor.
- [ ] `GET /events` returns the sorted list per contract.

### 3.2 Backend tests
- [ ] Synthetic-data unit tests for each detector (including flip-flop debounce, pit-related flips, SC bunching, retirement).
- [ ] Sanity test on the real Suzuka 2026 R3 session: print counts per type; assert plausible ranges (e.g. 0 < overtakes < 150, pit stops ≤ 2 per driver for a typical race) and manually spot-check three events against the legacy replay at the reported times (record in evidence).

### 3.3 Timeline component (replaces legacy `RaceProgressBarComponent`)
- [ ] Full-width bar under the workspace: lap ticks with lap numbers, current position playhead, **hover preview** (time, lap, nearest event label), click/drag to scrub (throttle `seek` to ~30 Hz; while dragging show `buffering` gracefully).
- [ ] **Flag/SC bands** drawn as colored segments behind the track of the bar; **event markers** as small icons above it (pit ▮, overtake ⇄, retirement ✕, fastest lap ◆ in `--best`, incident ⚠). Overlap handling: cluster markers when zoomed out (count badge), expand on zoom.
- [ ] **Zoom the timeline** (wheel / buttons) to inspect a lap range; minimap of the whole race remains visible.
- [ ] Filter chips: toggle event types and "selected driver only".
- [ ] Draw with Canvas2D or SVG (≤ a few hundred markers is fine); no per-frame React re-render (playhead moved via the clock subscription).

### 3.4 Key moments
- [ ] **Key Moments drawer** (right/bottom): chronological list of events with icons, lap, time, drivers; filters; click → seek to `t − 3 s`, auto-select involved drivers, highlight them on the canvas for 4 s.
- [ ] **Next/previous key moment** buttons and shortcuts (`J` / `K`); respects active filters.
- [ ] Context panel's "Race summary" card gets a "Latest moments" list (slot reserved in Phase 4).

### 3.5 Transport controls (replaces `RaceControlsComponent`)
- [ ] Rewind / play-pause / fast-forward buttons (hold to scrub, with legacy hover/press feedback), jump ±10 s and ±1 lap, **restart**, speed control (Popover with 0.5×, 1×, 2×, 4×, 8×, 16×, 32×; current speed chip also in the race strip).
- [ ] Buffering indicator and disabled state when the session isn't ready.

### 3.6 Shortcuts + command palette
- [ ] Keyboard parity (global, ignore when typing in inputs): `Space` play/pause · `←/→` jump ±10 s (`Shift` = ±1 lap) · `↑/↓` speed up/down · `1–4` speeds 0.5/1/2/4 · `R` restart · `D` DRS zones · `B` toggle timeline · `L` driver labels · `H`/`?` shortcuts overlay · `J/K` next/prev key moment · `F` toggle focus · `Esc` clear selection/close overlays.
- [ ] **Shortcuts overlay** (replaces `ControlsPopupComponent`/`LegendComponent`): modal listing every shortcut with `Kbd` caps; opened by `H`/`?` and a persistent "Help" button.
- [ ] **Command palette** (`Ctrl/Cmd+K`, using `cmdk`): "Go to lap N", "Select driver XXX", "Jump to next safety car", "Toggle labels/DRS/trails", "Open panel …" (panels arrive in Phase 6; register commands generically).

### 3.7 Tests
- [ ] Unit: marker clustering, scrub throttling, next/prev-moment logic with filters, shortcut dispatcher (ignores inputs, handles modifiers).
- [ ] Playwright: click an overtake marker → clock seeks, selected drivers set, canvas highlight present; press `J` moves to the next moment; shortcuts all trigger expected store changes; palette "Go to lap 10" seeks correctly.

## 4. Files
**Create:** `src/web/services/events_service.py`, tests, `web/src/features/{timeline,key-moments,transport,shortcuts,command-palette}/**`.
**Modify:** `routers` (`/events`), job stages, `RaceWorkspace`, `uiStore`.
**Delete:** the Phase 2 minimal transport/slider placeholder (replace = delete).

## 5. Acceptance criteria
- [ ] AC1: `/events` returns all event types for the real race, all detector unit tests pass, and three spot-checked events match the legacy replay (evidence).
- [ ] AC2: No pit-stop-caused position changes are labelled overtakes in the spot-check window; no flip-flop duplicates.
- [ ] AC3: Timeline scrubbing is responsive (< 100 ms to visual update after release on cached chunks) and never leaves the clock in a stuck `buffering` state.
- [ ] AC4: Hover preview, markers, flag/SC bands, clustering and zoom work and match the mockup.
- [ ] AC5: Clicking a key moment seeks, selects drivers and highlights them; `J/K` navigate; filters respected.
- [ ] AC6: All keyboard shortcuts in the parity list work; overlay lists them; palette works.
- [ ] AC7: Timeline/playhead updates do not re-render React per frame (Profiler evidence).
- [ ] AC8: **Demo-path check:** a fresh person can open the app, load a race, play, scrub, jump to a safety car and watch an overtake in under 2 minutes without instructions (record a short screen capture).

## 6. Verification
pytest + Vitest + Playwright output; screenshots; event-count table; screen recording → `evidence/phase-5/`.

## 7. Pitfalls
- Overtake detection on **cumulative distance** ordering during the lap-1 pack and SC bunching: derive from `position` but require stability; test those windows specifically.
- Pit-lane cars can have odd `dist` ordering — exclude pit windows from the stability check.
- Seeking while dragging: cancel superseded chunk fetches; don't spam the network.
- Shortcut conflicts with the browser (`Ctrl+K` in some browsers) — call `preventDefault` only inside the app focus.

## 8. Hand-off
Phase 6 registers panels as palette commands and uses event markers for chart annotations. Phase 7 may add ML markers to the same marker system.

## 9. Kickoff prompt (copy-paste)
```
You are starting Phase 5 (Timeline, Events & Controls) of the F1 Synapse web revamp.
Read: 00_MASTER_PLAN.md, PHASE_5_TIMELINE_AND_EVENTS.md, REF_API_CONTRACT.md,
REF_DESIGN_SYSTEM.md, LEGACY_LOGIC.md and the approved mockups. Phases 3 and 4 done.

First implement and test the backend event detection (all thresholds in one
EventConfig, derived from the server `position` channel, with stability/debounce and
pit exclusion). Then build the timeline, key-moments drawer, transport controls,
shortcut parity, shortcuts overlay and command palette. Replace the Phase 2 transport
placeholder (delete it). Spot-check three detected events against the legacy replay and
include evidence. End with the Phase report and the 2-minute demo-path recording.
```

---

## 10. Visual Elevation Addendum (v1.1 Art Direction)

*Established in Phase 3.5 to preserve broadcast visual polish across the timeline, scrubbing bar, and transport controls.*

### 10.1 Timeline Bar & Progress Track
- **Timeline Track Foundation:** Base progress rail styled in `--surface-1` with a discrete 1px `--border-hi` top highlight edge separating it from the canvas above.
- **Flag & Caution Bands:** Soft tinted background regions spanning the active temporal window:
  - Green flag: `rgba(0, 210, 106, 0.08)`.
  - Yellow flag / local caution: `rgba(255, 230, 0, 0.12)`.
  - Red flag: `rgba(235, 10, 30, 0.15)`.
  - Safety Car (SC / VSC): `rgba(255, 135, 0, 0.12)` amber/orange glow.
- **Event Markers:** $16 \times 16$px rounded rectangular badges with high-contrast event icons and small 3px team-color indicator pips.
- **Playhead Needle:** 2px high-visibility `--accent` line capped with a soft glowing circular pip and an interactive floating current-time / lap tooltip.

### 10.2 Transport Controls & Key Moments
- **Grouped Transport Toolbar:** Enclosed pill container styled with `--surface-2`, 1px `--border-hi` top edge highlight, and interactive states on `--surface-3`.
- **Playback Active State:** Play/pause button illuminates with `--accent` indicator halo when active.
- **Key Moments Cards:** Compact horizontal cards in the drawer with team color badge, relative time delta, and mini track position dot indicating where the moment transpired.

