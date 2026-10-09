# Phase 2 — Frontend Foundation

> **Size:** L · **Depends on:** Phase 0 (approved mockups), Phase 1 (API) · **Branch:** `web/phase-2-foundation`

## 1. Goal
Stand up the React + TypeScript app: tooling, the design system implemented from tokens, the responsive app shell with named regions, and — most important — the **playback engine** (`PlaybackClock` + `FrameStore`) that every later phase builds on. At the end, the shell loads a session, plays it, and shows raw numbers in the regions; the canvas and polished components come next.

## 2. Scope
**In:** Vite + React + TS + Tailwind setup, tokens, primitive components + `/dev/gallery`, API client with generated types, stores, playback engine with tests, shell layout, fixture mode, Playwright smoke test.
**Out:** the Pixi renderer (Phase 3), tower/panels content (Phase 4), timeline UI (Phase 5), docking (Phase 6).

## 3. Tasks

### 3.1 Tooling
- [ ] `web/` with Vite + React + TypeScript (strict). Use current stable versions; pin in the lockfile.
- [ ] Tailwind configured to read **only** CSS-variable tokens (no raw hex in components). ESLint + Prettier + `tsc --noEmit` scripts.
- [ ] Vitest (unit), Playwright (e2e + screenshots). npm scripts: `dev`, `build`, `test`, `e2e`, `typecheck`, `lint`, `gen:types`.
- [ ] Vite dev proxy: `/api` → `http://127.0.0.1:8000`.
- [ ] Self-hosted fonts in `web/src/design/fonts/` (Titillium Web, Inter, JetBrains Mono), loaded via `@font-face` — no CDN.

### 3.2 Design system
- [ ] `design/tokens.css` and `tokens.ts` exactly per `REF_DESIGN_SYSTEM.md` (colors, type, spacing, radius, motion, density attr, reduced-motion).
- [ ] Build the component inventory from the design system using Radix primitives + lucide icons: Button, Chip, Badge, TyreBadge, FlagPill, DriverChip, Card, PanelHeader, Tabs, Segmented, Toggle, Slider, Tooltip, Popover, Dialog, Menu, Gauge, StatBar, Sparkline, Skeleton, EmptyState, ErrorState, Kbd, ProgressBar.
- [ ] `/dev/gallery` route: every component in every state. This is the visual-verification surface for the design system.
- [ ] Wordmark component "F1 SYNAPSE" (own type treatment; no official logo).

### 3.3 API layer
- [ ] `api/client.ts`: typed fetch wrapper (uses `types.gen.ts` from `npm run gen:types`), error normalisation to the contract error shape, abort support.
- [ ] `api/frames.ts`: `fetchChunk(sid, k)` → `ArrayBuffer`; `parseChunk(buffer)` per the binary spec → typed-array views (zero-copy where possible).
- [ ] TanStack Query for JSON endpoints; chunks are managed by `FrameStore`, not Query.
- [ ] **Fixture mode:** `?fixture=suzuka-2026-r3` makes the API layer read from `web/fixtures/` instead of the network so UI work needs no backend.

### 3.4 Playback engine (`web/src/engine/`) — the critical piece
- [ ] **`PlaybackClock`**: requestAnimationFrame-driven. State: `raceTime` (s, float), `rate` (0.25–32×), `status: playing|paused|buffering|ended`. Methods: `play, pause, toggle, seek(t), stepSeconds(dt), setRate(r), restart()`. `subscribe(cb)` called every frame (for the canvas) and `subscribeThrottled(cb, hz)` (for UI). **Playhead is never React state.**
- [ ] **`FrameStore`**: LRU chunk cache; keeps chunk 0 pinned plus a window around the playhead; prefetches ahead proportional to `rate`; dedupes in-flight requests; sets clock to `buffering` if the needed chunk isn't ready (and resumes automatically).
- [ ] **`FrameStore.sample(t, out: Snapshot)`**: fills a **preallocated** `Snapshot` (see `REF_API_CONTRACT.md §5`). Linear interpolation for continuous channels, lower-frame for discrete; correct across chunk boundaries; handles the final frame and retired drivers (hold last position, `status=1`). `orderByPosition` filled without allocation.
- [ ] **`getSeries(driverIndex, channel, t0, t1, step, outArray)`** for charts (no allocation; used from Phase 6).
- [ ] React bindings: `usePlaybackStatus()`, `usePlayhead(hz)`, `useSnapshotSelector(selector, hz)` built with `useSyncExternalStore`; **no setState at 60 Hz**.

### 3.5 Stores (Zustand)
- [ ] `sessionStore` (meta, track, loading state), `selectionStore` (selected drivers, hovered driver, compare list), `uiStore` (panels, toggles: labels, DRS zones, progress bar, density, performance mode), `settingsStore` (persisted).

### 3.6 App shell
- [ ] Router: `/` (home placeholder), `/race/:sid`, `/dev/gallery`.
- [ ] `RaceWorkspace` layout per the design system grid: `TopStrip`, `TimingTowerSlot`, `CanvasSlot`, `ContextPanelSlot`, `TimelineSlot` — each slot renders a labelled placeholder showing live engine data (e.g. current `raceTime`, P1 code from the snapshot) so the engine is demonstrably wired.
- [ ] Responsive behaviour per design-system breakpoints; verify at 1366×768, 1920×1080, 2560×1440.
- [ ] Global `ErrorBoundary`, `BackendDisconnected` state (health ping), loading skeleton for session load with SSE progress.
- [ ] Minimal transport (play/pause/seek slider) in `TimelineSlot` for engine testing.

### 3.7 Tests
- [ ] Vitest: `PlaybackClock` (play/pause/seek/rate, status transitions), `FrameStore.sample` (interpolation correctness on synthetic data, chunk-boundary continuity, last frame, retired driver, `orderByPosition` matches `position`), `parseChunk` against the fixture binary and the Python reference decode from Phase 1.
- [ ] Performance test: sampling 20 drivers × 10,000 calls does **zero allocations** (assert via a counting `Float32Array` factory / heap check) and averages < 0.05 ms per call.
- [ ] Playwright smoke: load fixture, press play, wait 3 s, assert `raceTime` advanced and P1 code displayed; screenshot at 3 viewport sizes.

## 4. Files
**Create:** all of `web/` (config, `src/{app,design,engine,api,stores,features/_placeholders}`), `web/e2e/`.
**Modify:** `.gitignore` (node_modules, dist), root README (how to run web dev).
**Delete:** nothing.

## 5. Acceptance criteria
- [ ] AC1: `npm run typecheck && npm run lint && npm run test` pass; paste output.
- [ ] AC2: `npm run dev` + backend (or fixture mode) → opening `/race/<sid>` plays the session; slots show live engine values; seek works across chunk boundaries and while playing.
- [ ] AC3: `/dev/gallery` shows every component in every state; screenshots saved.
- [ ] AC4: Shell matches the approved mockup's region layout at all three viewport sizes with **no overlap and no horizontal scroll**.
- [ ] AC5: Engine perf test passes (zero allocation, < 0.05 ms/sample).
- [ ] AC6: No hex color literals outside `tokens.css/ts` (grep evidence).
- [ ] AC7: No React re-render storm: React Profiler shows the shell does not re-render per frame during playback (screenshot).
- [ ] AC8: Works offline (fonts/assets local) — verified by disabling network in the browser.

## 6. Verification
Vitest/Playwright output; gallery + shell screenshots into `evidence/phase-2/`; a 10-second screen recording or trace of playing with the React Profiler open.

## 7. Pitfalls
- Don't keep `raceTime` in Zustand/React state — it will re-render everything at 60 Hz.
- Don't allocate objects/arrays inside `sample()` or the clock tick.
- Don't couple the engine to Pixi or to React; it must be framework-agnostic and unit-testable.
- Make sure seek during `buffering` doesn't dead-lock; add a test.
- Typed-array views over the fetched `ArrayBuffer` must respect 4-byte alignment from the chunk format.

## 8. Hand-off
Phase 3 receives: `PlaybackClock`, `FrameStore.sample`, `Snapshot`, track geometry in the session store, `CanvasSlot` DOM node, tokens. Phase 4 receives the slots and primitives.

## 9. Kickoff prompt (copy-paste)
```
You are starting Phase 2 (Frontend Foundation) of the F1 Synapse web revamp.
Read in order: 00_MASTER_PLAN.md, PHASE_2_FRONTEND_FOUNDATION.md,
REF_DESIGN_SYSTEM.md, REF_API_CONTRACT.md (v1.0), DECISIONS.md, and open the
approved mockups in docs/web-revamp/mockups/. Phases 0 and 1 must be complete.

Create web/ exactly as specified. The playback engine (PlaybackClock + FrameStore
+ Snapshot sampling) is the most important deliverable: keep it framework-agnostic,
allocation-free in the hot path, and fully unit-tested. Never store the playhead in
React state. Implement the design tokens/components and the responsive shell so it
matches the approved mockup layout with no overlap. Use fixture mode so UI work
doesn't need the backend. Commit per sub-section. Finish with the Phase report with
test output, screenshots and the React Profiler evidence.
```
