# Phase 3 — Track Canvas (PixiJS)

> **Size:** L · **Depends on:** Phase 2 · **Branch:** `web/phase-3-canvas`

## 1. Goal
Replace the Arcade circuit view with a GPU-accelerated PixiJS renderer that looks like a modern broadcast map: smooth 60 fps car motion (interpolated), glowing track ribbon with mini-sectors and DRS bands, car trails, driver labels without collisions, safety-car visuals, flag tinting, camera pan/zoom/follow, and a focus mode.

## 2. Scope
**In:** `render/` module (imperative Pixi stage), layers, camera, hit-testing, hover/selection, focus mode, flag/SC visuals, debug FPS overlay, tests.
**Out:** tower/panels (Phase 4), timeline (Phase 5), ML overlays (Phase 7 — but leave an **overlay layer hook**).

## 3. Architecture (decision D3)
- One React component `TrackCanvas` owns a `<div>`; on mount it creates `new TrackRenderer(container)` (plain TypeScript class using PixiJS v8) and destroys it on unmount. **No `@pixi/react`.**
- The renderer subscribes to `PlaybackClock` per-frame, calls `FrameStore.sample(t, snapshot)` into a **preallocated** snapshot and updates display objects in place. React never re-renders per frame.
- Renderer reads selection/toggles through a small subscription to the stores (not props).
- Layers (bottom → top): `Background` · `TrackAsphalt` · `MiniSectors` · `DrsBands` · `FinishLine` · `Corners` · `Trails` · `Cars` · `Labels` · `SafetyCar` · `OverlayHook` (for Phase 7) · `FocusDim`.

## 4. Tasks

### 4.1 Setup
- [ ] Add PixiJS v8; create `web/src/render/TrackRenderer.ts` + `layers/*`, `camera.ts`, `hitTest.ts`, `palette.ts` (reads CSS tokens at runtime so canvas colors come from the design system).
- [ ] `devicePixelRatio` capped at 2; `ResizeObserver` drives resize; `antialias` on; `autoDensity` on.

### 4.2 Track geometry
- [ ] Build the ribbon from `TrackGeometry` inner/outer edges: dark asphalt fill, 1.5 px light edge lines, subtle outer glow (cheap — pre-rendered texture/filter applied once, not per frame).
- [ ] Respect `rotationDeg` (broadcast orientation) with a toggle for "north-up".
- [ ] Mini-sector coloring along the ribbon (neutral by default; hook for sector bests later).
- [ ] DRS zones as subtle animated-less green bands on the outer edge (toggle `D`).
- [ ] Finish line: checkered pattern perpendicular to the centerline at `finishIndex`.
- [ ] Corner numbers (if provided) as small labels, hidden when zoomed out.
- [ ] Flag tint: ribbon edge color follows `trackStatus` (green neutral, yellow, red, SC orange, VSC) with a 200 ms color transition.

### 4.3 Cars
- [ ] Car marker = filled circle in team color with 1.5 px dark outline; selected car = white ring + larger; hovered = scale 1.15.
- [ ] Pit-lane cars dimmed (60 % alpha) with a small "P" marker; retired cars (`status=1`) hidden or shown as a grey ✕ at last position (toggle in settings later).
- [ ] DRS-open indicator: soft green pulse ring (disabled under reduced-motion).
- [ ] Z-order: leader on top, then by position (so the front of a pack is never hidden behind rear cars).
- [ ] Driver code labels: greedy collision avoidance in screen space (try 8 offset slots; hide lowest-priority label on conflict; selected/compare drivers always shown; toggle `L`; auto-hide when zoomed far out).

### 4.4 Trails
- [ ] Per-driver ring buffer of recent positions (last N seconds, N configurable 0–6 s, default 3 s) stored in **preallocated** typed arrays. Draw as a tapering, fading polyline (use Pixi `MeshRope`/geometry updated in place). Subsampled to ≤ 30 points per driver.
- [ ] Trails reset on seek (clear buffers) so they never draw a line across the circuit after a jump.
- [ ] Performance mode: trails off.

### 4.5 Safety car
- [ ] SC marker using `scX/scY/scPhase`: orange circle with "SC" label, pulsing glow while on track; fading dashed trail during deploying/returning; label shows phase text.

### 4.6 Camera
- [ ] World→screen transform in `camera.ts` (zoom, rotation, pan; no allocation per call).
- [ ] Modes: **Fit** (frame whole circuit with padding, recalculated on resize), **Free** (drag to pan, wheel/pinch to zoom around cursor, clamped), **Follow** (smoothly track the selected driver; zoom preset), double-click resets to Fit. Smooth interpolated transitions (≈ 300 ms, ease-out) between modes.
- [ ] Never bake pixel margins for panels into the math — use the container's measured size.

### 4.7 Interaction
- [ ] `hitTest(screenX, screenY)` → nearest car within 14 px (spatial scan of ≤ 22 cars is fine). Click selects (shift/ctrl+click adds to compare), hover sets `hoveredDriver` (tooltip with code, position, speed).
- [ ] **Focus mode:** when 1–2 drivers are selected, dim all other cars/trails to 25 %, and draw thin connector lines to the car ahead and behind with the gap label (`+0.812`). Toggle via a UI button (Phase 4 adds the control; expose `renderer.setFocus(boolean)` now).

### 4.8 Debug & budget
- [ ] Dev-only FPS/frame-time overlay (toggle with backtick) showing sample ms, render ms, draw calls, texture memory.
- [ ] **Budget:** ≥ 55 fps average with 20 cars + trails on an integrated GPU laptop at 1920×1080; JS time per frame < 4 ms; **zero per-frame allocations** (verify with a Chrome performance recording: no recurring GC spikes during 60 s of playback).

### 4.9 Tests
- [ ] Unit: camera transforms (round-trip world↔screen, fit math), label collision algorithm, hit-testing, trail ring buffer (wrap, reset on seek).
- [ ] Playwright visual tests on the fixture at fixed times (e.g. T+20 s, T+60 s): screenshots compared against baselines; run at 1366×768 and 1920×1080.

## 5. Files
**Create:** `web/src/render/**`, `web/src/features/track-canvas/TrackCanvas.tsx`, tests, baselines.
**Modify:** `RaceWorkspace` (replace `CanvasSlot` placeholder), `uiStore` (labels, DRS, trails length, focus, camera mode).
**Delete:** the Phase 2 `CanvasSlot` placeholder (replace = delete).

## 6. Acceptance criteria
- [ ] AC1: Playing the fixture/real session shows all cars moving **smoothly at display refresh rate** (not 25 Hz stepping) with trails and labels; matches the approved mockup's canvas look.
- [ ] AC2: Car order along the track visually agrees with `position` from the snapshot at 5 sampled times (P1 is the furthest-ahead car in the direction of travel) — evidence screenshots with the tower placeholder or debug list beside them.
- [ ] AC3: Seek/rewind clears trails; no stray lines.
- [ ] AC4: Pan, zoom, fit, follow all work; resizing the window keeps the circuit centered and never overlaps panels.
- [ ] AC5: Click/hover selection works; selection store updates; focus mode dims others and shows ahead/behind connectors.
- [ ] AC6: SC and flag visuals render for the safety-car/flag windows identified in Phase 0 fixtures.
- [ ] AC7: Perf budget met (recording + FPS overlay screenshot); zero recurring GC spikes.
- [ ] AC8: All unit tests and Playwright visual tests pass.
- [ ] AC9: Reduced-motion disables pulses; performance mode disables trails.

## 7. Verification
Screenshots at 3 viewports × 3 moments; Chrome performance trace summary; test output → `evidence/phase-3/`.

## 8. Pitfalls
- Creating `Graphics`/`Text` objects per frame → leaks and GC. Create once, mutate.
- Pixi `Text` is expensive: use `BitmapText` (or pre-rendered label textures) for driver codes.
- Trails across seeks and across the start/finish wrap.
- Rotation + labels: labels must stay upright and screen-aligned.
- Destroy renderer, listeners and RAF subscriptions on unmount (hot-reload leaks).
- Don't read the DOM/CSS every frame; cache token colors and refresh only on theme/density change.

## 9. Hand-off
Phase 4 uses `selectionStore`, `renderer.setFocus`, hovered/selected signals. Phase 5 uses `renderer` for event "jump & highlight". Phase 7 draws into `OverlayHook`.

## 10. Kickoff prompt (copy-paste)
```
You are starting Phase 3 (Track Canvas) of the F1 Synapse web revamp.
Read: 00_MASTER_PLAN.md, PHASE_3_TRACK_CANVAS.md, REF_DESIGN_SYSTEM.md,
REF_API_CONTRACT.md, DECISIONS.md, and the approved mockups. Phase 2 must be complete.

Build the PixiJS renderer as a plain TypeScript class (no @pixi/react) that reads
FrameStore.sample() into a preallocated Snapshot each frame and mutates display
objects in place — no allocations in the hot path, no React state at 60 Hz.
Implement layers, camera, trails, labels with collision avoidance, SC/flag visuals,
hit-testing, focus mode and the FPS debug overlay per the spec. Replace the Phase 2
canvas placeholder (delete it). Verify car order agrees with snapshot positions and
that perf budgets are met; include screenshots and a perf trace summary in the
Phase report.
```
