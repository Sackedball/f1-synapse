# Phase 8 — Home, Qualifying & Settings

> **Size:** M · **Depends on:** Phase 2 (can run in parallel with 3–7 once the API exists) · **Branch:** `web/phase-8-home-quali`

## 1. Goal
Replace the remaining Qt windows — session selector, qualifying viewer, settings dialog — with web equivalents so the whole product lives in one app.

## 2. Scope
**In:** home screen (season calendar, cache status, load flow with progress), qualifying view + backend endpoints, settings page + endpoints, recents, empty/error/offline states.
**Out:** sprint-specific features unless the legacy app already supports them (`VERIFY` in `LEGACY_LOGIC.md`); account/cloud features.

## 3. Tasks

### 3.1 Home screen (replaces `RaceSelectionWindow`)
- [ ] **Season picker** (year select, default latest available) → **calendar grid** of race cards from `/seasons/{year}/schedule`: round, name, country, date, circuit outline thumbnail (from cached track geometry when available, otherwise a neutral placeholder icon), session chips (Race / Qualifying / Sprint… as available).
- [ ] **Cache status** on each chip (`Downloaded` ✓ / `Needs download` ↓) from `/cache/status`. "Refresh data" action (confirm dialog) → `POST /sessions/load { refresh: true }`.
- [ ] **Load flow:** click a session chip → full-screen progress view consuming the SSE stages (Downloading · Processing drivers 12/20 · Resampling · Indexing events · Computing ML) with elapsed time and a **Cancel** option (if the backend supports cancellation; else hide). On `ready` navigate to `/race/:sid` or `/quali/:sid`.
- [ ] **Recents** row (last 5 sessions, stored locally) and deep links `?session=` handled.
- [ ] **Offline / API-failure states:** if FastF1 is unreachable show cached sessions only with a clear message; errors map to friendly text with a "Details" expander and a retry.
- [ ] Empty state for years with no data; skeletons while loading the schedule.

### 3.2 Backend — qualifying (`src/web/routers/quali.py`, `services/quali_service.py`)
- [ ] Wrap the existing qualifying pipeline functions (`get_qualifying_results`, `get_driver_quali_telemetry` or their actual names — `VERIFY`), **never copy their logic**.
- [ ] `GET /quali/results` → per-driver best laps per segment (Q1/Q2/Q3) with sector times and flags for which segments the driver participated in.
- [ ] `GET /quali/telemetry?driver=&segment=` → arrays on a **distance grid** (speed, gear, throttle, brake, x, y, time/elapsed) for the driver's best lap in the segment, plus lap time and sector splits.
- [ ] Contract version bump, regenerate types, tests (shape, monotonic distance, segment filtering, missing-driver error).

### 3.3 Qualifying view (replaces `QualifyingReplay` + 3 qualifying components)
- [ ] **Segment selector** (Q1 / Q2 / Q3 segmented control) and **driver multi-select** (up to 4) with team-colored chips.
- [ ] **Results table** (replaces `LapTimeLeaderboardComponent`): position, driver, best time, gap, sector cells colored purple/green/yellow per design-system rules, tyre compound used.
- [ ] **Stacked charts** (reuse Phase 6 `DistanceChart`): speed, gear, throttle/brake vs distance, with a shared cursor; benchmark = fastest selected driver; **delta-time** trace vs benchmark (replaces `QualifyingLapTimeComponent`).
- [ ] **Circuit mini-map** (Pixi or SVG) animating the selected drivers around their laps in sync with a lap clock; scrub/play/pause; cursor on charts ↔ marker on the map.
- [ ] Keyboard: `Space` play/pause, `←/→` step, `1–4` speed, `R` restart (parity).

### 3.4 Settings (replaces `SettingsDialog`)
- [ ] `GET/PUT /api/settings` (cache folder, data folder, validated paths; reuse the existing settings storage — don't create a second source of truth).
- [ ] Settings page sections: **Data** (paths with "Browse"-like text input + validation, cache size/clear cache), **Display** (units km/h↔mph and °C↔°F, density comfortable/compact, trails length, labels default, performance mode), **Accessibility** (reduced motion override, colorblind-safe mode — implemented in Phase 9, toggle present here), **Shortcuts** reference, **About** (version, data attribution, licenses).
- [ ] Unit conversion implemented once in `utils/units.ts` and used everywhere (tower, driver card, weather, charts).

### 3.5 Tests
- [ ] Backend: quali endpoints (see §3.2), settings validation (invalid path rejected, round-trip).
- [ ] Frontend unit: unit conversions, calendar grouping, recents logic, sector-color classifier.
- [ ] Playwright: home → choose cached session → progress UI (mock SSE) → race page loads; offline mock shows cached-only message; qualifying view segment switch updates charts; settings change (units) updates the race UI.

## 4. Files
**Create:** `src/web/routers/{quali,settings}.py`, services, tests, `web/src/features/{home,quali,settings}/**`, `web/src/utils/units.ts`.
**Modify:** router, `settingsStore`, contract.
**Delete:** nothing in web (legacy removed in Phase 10).

## 5. Acceptance criteria
- [ ] AC1: Fresh launch with no `?session=` shows the home screen; cached sessions are marked and open instantly.
- [ ] AC2: Loading an uncached session shows real staged progress and lands on the race view.
- [ ] AC3: Offline/failed-API path shows cached-only mode and friendly errors (tested with mocked failure).
- [ ] AC4: Qualifying view parity with legacy: segment switching, multi-driver compare, delta vs benchmark, circuit mini-map; spot-check best-lap times against the legacy viewer (evidence).
- [ ] AC5: Settings persist across restart; invalid paths rejected with clear errors; unit changes apply app-wide.
- [ ] AC6: Matches approved mockups for Home and Qualifying at 1366×768 and 1920×1080; no overlaps.

## 6. Verification
Screenshots, test output, legacy-vs-new qualifying comparison → `evidence/phase-8/`.

## 7. Pitfalls
- Schedule/cache calls must not trigger FastF1 downloads as a side effect.
- Qualifying "best lap per segment" semantics differ from race laps — follow legacy behaviour, record edge cases (driver eliminated in Q1) in `NOTES.md`.
- Don't let the settings page write paths without validating they exist and are writable.
- Keep distance-grid resampling identical across drivers so deltas are meaningful.

## 8. Hand-off
Phase 9 polishes all screens; Phase 10 removes the Qt versions.

## 9. Kickoff prompt (copy-paste)
```
You are starting Phase 8 (Home, Qualifying & Settings) of the F1 Synapse web revamp.
Read: 00_MASTER_PLAN.md, PHASE_8_HOME_QUALI_SETTINGS.md, REF_API_CONTRACT.md,
REF_DESIGN_SYSTEM.md, LEGACY_LOGIC.md and the approved Home/Qualifying mockups.

Build the home screen with cache-aware calendar and SSE load progress, the qualifying
backend endpoints (wrapping existing pipeline functions) and the qualifying view reusing
the Phase 6 chart primitives, and the settings page with validated paths and a single
unit-conversion module. Keep the contract versioned and types regenerated. Spot-check
qualifying best-lap numbers against the legacy viewer and include evidence in the Phase
report.
```
