# Phase 9.5 — Exhaustive Step-by-Step Instructions for Polish, Performance & Accessibility

> **Purpose of this document:** You are an AI coding agent. This file is your complete, self-contained blueprint for executing Phase 9 of the F1 Synapse web revamp. You will read this file and execute every instruction in order. You do NOT need to make any architectural or design decisions — they are all pre-made for you here. Follow every step literally. The output of your work is code changes, test results, evidence screenshots, and measured numbers.

> **Branch:** Create branch `web/phase-9-polish` from the current HEAD.

> **Prerequisite reading (do this before touching any file):** Read `docs/web-revamp/00_MASTER_PLAN.md` (especially section 7: Global Rules), `docs/web-revamp/REF_DESIGN_SYSTEM.md`, and `docs/web-revamp/PHASE_9_POLISH_PERF_A11Y.md`. Also skim `docs/web-revamp/DECISIONS.md` and `docs/web-revamp/NOTES.md`.

> **Golden rule:** This phase adds ZERO new features. You are auditing, fixing, optimizing, and polishing what already exists. If you discover something that needs a new feature, write it into `docs/web-revamp/NOTES.md` and continue.

---

## TABLE OF CONTENTS

1. [Motion Audit](#1-motion-audit)
2. [State Audit](#2-state-audit)
3. [Performance Pass](#3-performance-pass)
4. [Accessibility Pass](#4-accessibility-pass)
5. [Responsive Pass](#5-responsive-pass)
6. [Export / Share Feature](#6-export--share-feature)
7. [Visual Regression & Bundle Audit](#7-visual-regression--bundle-audit)
8. [Final Verification & Report](#8-final-verification--report)

---

## 1. MOTION AUDIT

### 1.1 Inventory Every Animation

You need to go through every single file in the project and catalogue every CSS transition, CSS animation, and JavaScript/PixiJS-driven animation. Here is exactly how to do it:

**Step 1 — Grep for all CSS animations and transitions across the entire `web/src/` directory:**

Run a recursive search for the following patterns across all `.tsx`, `.ts`, and `.css` files in `web/src/`:
- `transition`
- `animation`
- `@keyframes`
- `transform`
- `opacity` (when used alongside transition or animation)
- `setTimeout` or `requestAnimationFrame` used for visual animation (not data fetching)
- Any PixiJS `ticker` or `gsap`/`tween` usage in `web/src/render/` files

For each match you find, record in a temporary scratch file:
- **File path** (e.g., `web/src/components/ui/FlagPill.tsx`)
- **Line number(s)**
- **What is being animated** (e.g., "background-color transition on flag status change")
- **Current duration** (e.g., `200ms`, or a hardcoded `0.3s`)
- **Whether it uses a motion token** (`var(--dur-base)`, `var(--dur-fast)`, `var(--dur-slow)`) — YES or NO
- **Whether it only animates `transform` and/or `opacity`** — YES or NO (if it animates `background-color`, `width`, `height`, `left`, `top`, `box-shadow`, `border`, `color`, etc., that is a violation)
- **Whether it respects `prefers-reduced-motion`** — YES or NO

**Step 2 — Also search the PixiJS render layer files:**

The render layers live at `web/src/render/layers/`. Each layer file (there are approximately 14 of them) may contain imperative animations. Read each of these files:
- `BackgroundLayer.ts`
- `CarsLayer.ts`
- `CornersLayer.ts`
- `DrsBandsLayer.ts`
- `FinishLineLayer.ts`
- `FocusDimLayer.ts`
- `FpsOverlay.ts`
- `LabelsLayer.ts`
- `MiniSectorsLayer.ts`
- `MlOverlay.ts`
- `SafetyCarLayer.ts`
- `TrackAsphaltLayer.ts`
- `TrailsLayer.ts`

Also read `web/src/render/TrackRenderer.ts` which is the main render loop orchestrator.

For each layer, note any animation that:
- Uses a hardcoded duration instead of referencing the CSS motion tokens
- Creates a glow or pulse effect (e.g., selection halo in `CarsLayer.ts`, DRS active glow in `DrsBandsLayer.ts`)
- Performs alpha/opacity changes over time
- Has a looping animation (only the live flag pill pulse should loop — everything else is a bug)

### 1.2 Fix Every Violation

Once you have the complete inventory, fix each violation as follows:

**For CSS transitions/animations that use hardcoded durations:**
Replace every hardcoded duration value (like `0.2s`, `200ms`, `300ms`, `150ms`, etc.) with the appropriate CSS custom property:
- Hover and press feedback → use `var(--dur-fast)` (120ms)
- Selection highlighting, panel open/close, popover appearance, flag-pill color change → use `var(--dur-base)` (200ms)
- Position swap animations (timing tower row reordering), layout shifts → use `var(--dur-slow)` (320ms)

**For transitions that animate layout-triggering properties:**
If any animation targets `width`, `height`, `left`, `top`, `margin`, `padding`, `border-width`, `font-size`, or similar layout-triggering properties, refactor it to use only `transform` (for position/scale changes) and `opacity` (for visibility changes). This is critical for maintaining 60fps because layout-triggering properties cause the browser to recalculate the entire layout tree.

For example, if something animates `left: 0` → `left: 100px`, change it to `transform: translateX(0)` → `transform: translateX(100px)`.

If something animates `height: 0` → `height: auto` (like a collapsible panel), the recommended approach is to use `transform: scaleY(0)` → `transform: scaleY(1)` with `transform-origin: top`, or use the `grid-template-rows: 0fr` → `grid-template-rows: 1fr` technique if the content height is truly dynamic.

**For easing functions:**
Standardize all easing functions to use one of the two motion tokens:
- `var(--ease-out)` — `cubic-bezier(0.2, 0.8, 0.2, 1)` — for things appearing/entering
- `var(--ease-in-out)` — `cubic-bezier(0.4, 0, 0.2, 1)` — for things moving or transitioning state

Remove any `ease`, `linear`, `ease-in`, `ease-out`, or custom bezier curves that are not one of these two tokens.

**For reduced-motion compliance:**
The file `web/src/design/tokens.css` already contains a `@media (prefers-reduced-motion: reduce)` block that sets all three duration tokens to `0ms` (lines 123-129). This means any CSS animation/transition that uses `var(--dur-fast)`, `var(--dur-base)`, or `var(--dur-slow)` will automatically be instant under reduced motion.

However, for PixiJS canvas animations, this media query has no effect because PixiJS operates outside the CSS system. You need to:
1. In `web/src/stores/settingsStore.ts`, the `reducedMotion` boolean already exists (line 10).
2. Make sure the app checks `window.matchMedia('(prefers-reduced-motion: reduce)')` at startup and sets `settingsStore.reducedMotion` accordingly. Add a listener for changes too.
3. In every PixiJS render layer that performs visual animation (selection halo pulse in `CarsLayer.ts`, DRS glow in `DrsBandsLayer.ts`, trail fading in `TrailsLayer.ts`, etc.), check `useSettingsStore.getState().reducedMotion`. If true, skip the animation entirely — set the final visual state immediately without interpolation.

### 1.3 Add Subtle Polish Animations (Only Where They Explain Change)

Add these three specific subtle animations and nothing else:

**Panel focus highlight:** When a user clicks on a panel in the analysis workspace (`web/src/features/analytics/AnalysisWorkspace.tsx`) or the race workspace, the focused panel should briefly flash its border from `var(--border)` to `var(--border-strong)` and back, using `var(--dur-base)` duration. Implement this as a CSS transition on `border-color` (this is one case where animating border-color is acceptable because it does not trigger layout, only paint). The trigger should be the panel receiving focus or being clicked.

**Key-moment jump pulse on canvas:** When the user clicks a key moment marker on the timeline (`web/src/features/timeline/TimelineMarker.tsx`) and the playback jumps to that moment, the corresponding car on the canvas should emit a single quick radial pulse (a brief expanding circle that fades from `opacity: 0.6` to `opacity: 0` over `var(--dur-slow)` = 320ms). Implement this in `CarsLayer.ts` by drawing a temporary expanding ring around the selected driver's position. If `reducedMotion` is true, skip this effect entirely.

**Timeline marker hover grow:** When hovering over a timeline event marker in `web/src/features/timeline/TimelineMarker.tsx`, the marker should scale up slightly from `scale(1)` to `scale(1.15)` using `transform` with `var(--dur-fast)` (120ms). This is a pure CSS `:hover` transition on `transform`.

### 1.4 Remove Bespoke Animations

Any animation that does not fit into one of the standardized categories above (hover, selection, position swap, popover, flag pill, the three polish items) should be removed. Grep for any remaining hardcoded `transition`, `animation`, `@keyframes`, or tween logic. Delete it if it is purely decorative and not explained by data change.

---

## 2. STATE AUDIT

### 2.1 Enumerate Every Screen and Async Boundary

You will create a comprehensive checklist. Every screen/route and every component that fetches data asynchronously must have proper states handled. Here is the complete list of screens and their async boundaries:

**Route: `/` — HomePage (`web/src/features/home/HomePage.tsx`)**
- Async boundaries: season schedule fetch (`getSeasonSchedule`), cache status fetch (`getCacheStatus`)
- Required states: loading skeleton (while schedule loads), error state (if schedule fetch fails — with retry button and human-readable message), empty state (if a season has no rounds — unlikely but handle it), partial data (some rounds cached, some not — this is the normal state, just show cache badges correctly), backend disconnected (show a banner at the top saying "Backend unavailable — check that the server is running" with an auto-retry every 10 seconds)

**Route: `/race/:sid` — RaceWorkspace (`web/src/components/layout/RaceWorkspace.tsx`)**
- Async boundaries: session data fetch (drivers, track, frames), chunk fetching during playback, WebSocket/SSE reconnection
- Required states: loading skeleton for the entire workspace (timing tower shows 20 skeleton rows, canvas shows a centered spinner or pulsing F1 SYNAPSE wordmark, context panel shows skeleton cards), error state (if session fails to load — show ErrorState component with the session ID and a "Go Home" button), chunk fetch retry (if a frame chunk fails to download during playback, show a toast notification "Chunk fetch failed, retrying..." — do NOT stop playback, just show the toast and retry), backend disconnected (auto-retry banner across the top), session switching (when navigating from one session to another, show a transition state that clears old data before loading new data — do not show stale data from the previous session)

**Route: `/analysis/:sid` — AnalysisWorkspace (`web/src/features/analytics/AnalysisWorkspace.tsx`)**
- Async boundaries: each panel independently fetches its own data
- Required states: each panel (there are 7 panels in `web/src/features/analytics/panels/`) must independently show its own loading skeleton, error state, and empty state. The panel wrappers in `web/src/features/analytics/panelWrappers.tsx` should handle this uniformly. If a single panel fails, the other panels should keep working. Show an error message inside the failed panel with a retry button.

**Route: `/quali/:sid` — QualifyingPage (`web/src/features/quali/QualifyingPage.tsx`)**
- Async boundaries: qualifying results fetch, qualifying telemetry fetch
- Required states: loading skeleton for the results table (show 20 skeleton rows matching the table column structure), loading state for telemetry charts (show a pulsing placeholder area where the charts will appear), error state (if results fail to load — ErrorState with retry), empty state (if a session has no qualifying data — EmptyState saying "No qualifying data available for this session"), telemetry loading state (independent of results — results might load while telemetry is still loading)

**Route: `/settings` — SettingsPage (`web/src/features/settings/SettingsPage.tsx`)**
- Async boundaries: settings fetch (GET /api/settings), settings save (PUT /api/settings), cache clear (POST /api/settings/cache/clear)
- Required states: loading state while settings load (show skeleton inputs), save feedback (when user changes a setting, show a brief success toast "Settings saved" or error toast "Failed to save settings"), cache clear progress (the clear modal should show a progress indicator during deletion, and a success message when complete), error if settings endpoint is unreachable

**Component: TimingTower (`web/src/features/timing-tower/TimingTower.tsx`)**
- This component displays inside the race workspace. It must show:
  - Loading: 20 skeleton rows (each row should have a skeleton block for position, team color bar, driver code, gap, tyre, and pit count)
  - Error: ErrorState with message "Failed to load timing data"
  - Empty: EmptyState with message "No drivers in session" (this should never happen in practice, but handle it)
  - Disconnected: If the frame data stream stops, show a small warning icon in the panel header

**Component: ContextPanel (`web/src/features/context-panel/ContextPanel.tsx`)**
- Loading: skeleton cards where driver info cards would appear
- Error: ErrorState component
- Empty: EmptyState saying "Select a driver from the timing tower or track to see details"
- When no driver is selected, show the EmptyState — never show hardcoded "ML INSIGHT ENGINE" or "HEALTH OPTIMAL" placeholder text

**Component: RaceStrip (`web/src/features/race-strip/RaceStrip.tsx`)**
- Loading: skeleton chips in the strip bar
- When data is missing for individual fields (weather, track temp, etc.), show `—` only if that field genuinely has no data from the backend — never show `—` as a default placeholder that is not wired to data

### 2.2 Grep for Placeholder Values

Run the following searches across the entire `web/src/` directory and fix every match:

1. **Search for `"--"` or `'--'` literal strings** that appear as display values in JSX. Each match must be examined:
   - If it is a genuine "no data" display from a data field that can legitimately be null/undefined, it is acceptable but should be replaced with the more descriptive em-dash character `—` (U+2014) for typographic correctness
   - If it is a hardcoded placeholder that is not wired to any actual data source, it is a bug — replace it with the appropriate loading skeleton or with the actual data binding

2. **Search for `0` as a display value** in gap, time, speed, or position contexts. A gap of exactly `0` should display as `LEADER` or blank (for P1 driver), not as `0`. A speed of `0` is legitimate only if the car is actually stopped.

3. **Search for hardcoded English strings** like "ML INSIGHT ENGINE", "HEALTH OPTIMAL", "BRAKE ANOMALY", "TYRE DEGRADATION" that appear as static text not bound to any data from the backend. If these are real labels for ML feature categories that come from the backend data, they are fine. If they are placeholder/demo text that was put there during development to fill space, replace them with either the real data binding or with an EmptyState component.

4. **Search for `placeholder` or `TODO` or `FIXME` or `HACK`** in all TypeScript/TSX/CSS files. Address each one or document it in `NOTES.md` if it is genuinely out of scope.

### 2.3 Add Toast Notifications

The app currently does not have a toast system. You need to add one for non-blocking error notifications.

**Implementation approach:**
1. Install `sonner` (a lightweight React toast library, ~3KB gzip) — run `npm install sonner` in the `web/` directory
2. In `web/src/App.tsx`, add the `<Toaster />` component from `sonner` inside the `<ErrorBoundary>` wrapper but outside the `<BrowserRouter>`. Configure it with:
   - `theme="dark"` 
   - `position="bottom-right"`
   - `toastOptions={{ style: { background: 'var(--surface-3)', color: 'var(--text-1)', border: '1px solid var(--border)', fontFamily: 'var(--font-sans)' } }}`
   - `richColors` enabled
3. Create a utility file `web/src/utils/toast.ts` that exports convenience functions:
   - `showError(message: string, details?: string)` — calls `toast.error(message, { description: details })`
   - `showSuccess(message: string)` — calls `toast.success(message)`
   - `showInfo(message: string)` — calls `toast(message)`
4. Use these toast functions in the following places:
   - `web/src/api/client.ts` — when any API call fails with a network error (not a 4xx/5xx, but an actual fetch failure like `TypeError: Failed to fetch`), show a toast "Connection lost — retrying..."
   - `web/src/features/settings/SettingsPage.tsx` — after successfully saving settings, show "Settings saved"; after a failed save, show "Failed to save settings"
   - `web/src/features/settings/SettingsPage.tsx` — after successfully clearing cache, show "Cache cleared"; after failure, show "Failed to clear cache"
   - `web/src/features/home/SessionLoadModal.tsx` — if the SSE stream encounters an error during session loading, show a toast with the error details
   - The canvas/render system — if a frame chunk fetch retries, show "Frame data fetch failed, retrying..." (only once per retry cycle, not on every single retry attempt)

---

## 3. PERFORMANCE PASS

### 3.1 Code Splitting

The current `vite.config.ts` at `web/vite.config.ts` does not define manual chunk splitting. You need to add code splitting so the initial home page loads fast and heavy libraries are only loaded when needed.

**Step 1 — Add manual chunks to `vite.config.ts`:**

In the `defineConfig` object, add a `build.rollupOptions.output.manualChunks` function. Define these chunks:
- `'vendor-pixi'`: includes `pixi.js` — this is the largest dependency (~200KB gzipped). It should only load when the user navigates to `/race/:sid` which uses the PixiJS canvas.
- `'vendor-uplot'`: includes `uplot` — only needed for chart views (analysis workspace, qualifying telemetry)
- `'vendor-dockview'`: includes `dockview-react` — only needed for the analysis workspace at `/analysis/:sid`
- `'vendor-radix'`: includes all `@radix-ui/*` packages — these are used broadly but separating them into their own chunk helps with caching

**Step 2 — Lazy-load routes in `web/src/App.tsx`:**

Currently, `App.tsx` eagerly imports all page components at the top of the file. Change these to React lazy imports:

Replace the static imports for `RaceWorkspace`, `AnalysisWorkspace`, `QualifyingPage`, `SettingsPage`, and `DevGallery` with `React.lazy(() => import(...))` calls. Wrap the `<Routes>` in a `<Suspense>` fallback that shows a full-screen loading skeleton (a dark page with a centered pulsing Wordmark).

Keep `HomePage` as an eager import since it is the entry point and should load immediately.

For the lazy-loaded race workspace specifically, add a preload trigger: when the user clicks a session card on the home page (inside `HomePage.tsx`) or when `SessionLoadModal` begins loading, call `import('./components/layout/RaceWorkspace')` to start preloading the canvas chunk in the background while the session data is downloading. This way, by the time the session data is ready and the user navigates to `/race/:sid`, the PixiJS chunk is already cached.

**Step 3 — Verify bundle sizes:**

After implementing code splitting, run `npx vite build` and check the output chunk sizes. The initial JS for the home route (the entry chunk plus vendor-radix) must be under 400KB gzipped. Record the actual sizes in the Phase 9 report.

To get a detailed breakdown, temporarily install `rollup-plugin-visualizer` as a dev dependency (`npm install -D rollup-plugin-visualizer`), add it to the Vite plugins array with `template: 'treemap'` and `gzipSize: true`, run a build, and save the generated `stats.html` to `docs/web-revamp/evidence/phase-9/bundle-treemap.html`. Then remove the visualizer from the plugins (keep it as a dev dependency for future use).

### 3.2 Performance Profiling and Fixing

**The target machine class:** integrated GPU (Intel UHD or similar), 16 GB RAM, running Chrome/Edge. All measurements must be taken in a production build (`npm run build` then `npx vite preview`), NOT in dev mode.

**Performance budgets to hit:**

| Metric | Budget |
|---|---|
| Race workspace FPS (20 cars, trails, labels, ML overlays) | ≥ 55 avg, ≥ 45 p1 |
| JS time per frame (canvas render loop) | < 4 ms |
| JS time per frame (React UI updates) | < 2 ms |
| Seek-to-first-visual after cached chunk | < 100 ms |
| Seek to uncached chunk | < 600 ms |
| Memory after 90 min playback at 8× | no monotonic growth (< +10% over start) |
| Initial JS bundle (home route) | < 400 KB gzip |
| App cold start to interactive (cached session) | < 3 s |

**Step 1 — Profile the canvas render loop:**

Open the race workspace in Chrome with a fixture session. Open Chrome DevTools → Performance tab. Record 10 seconds of normal playback with all 20 cars visible, trails enabled, labels enabled, and ML overlays enabled.

Look at the flame chart for the `requestAnimationFrame` callback. Identify the top time consumers. Common offenders in a PixiJS app:
- **Object allocation inside the render loop:** If any `new Array()`, `new Float32Array()`, `new Object()`, or spread operators (`[...arr]`, `{...obj}`) are happening inside the per-frame render callback in `TrackRenderer.ts` or any layer's `update()` method, refactor to preallocate these at construction time and reuse them.
- **Unnecessary PixiJS Graphics rebuilds:** If `CarsLayer.ts` or `TrailsLayer.ts` is calling `.clear()` and `.beginFill()` / `.drawCircle()` every frame for every car, this is expensive. Instead, create the car graphics objects once at init time and only update their `x`, `y`, `rotation`, `tint`, and `alpha` properties each frame.
- **Text object creation:** If `LabelsLayer.ts` creates new `PIXI.Text` or `PIXI.BitmapText` objects every frame, cache them. Create 20 text objects (one per driver) at init and reuse them.
- **Layout thrashing in React:** If any React component subscribes to the Zustand `sessionStore` or `selectionStore` and re-renders at 60Hz (because the store updates every frame with position data), this is a major problem. The playhead position and car positions should NOT live in React state. They should be read directly from the stores inside the PixiJS render loop without triggering React re-renders. Use `zustand`'s `subscribe` method or `getState()` instead of `useStore()` hooks for frame-level data.

**Step 2 — Fix the top offenders:**

For each offender identified in the profiling:

a. **Preallocate typed arrays:** In `web/src/render/TrackRenderer.ts` or whichever file manages the per-frame data, create `Float32Array` buffers at construction time for positions (20 cars × 2 floats = 40), rotations (20 floats), and any other per-frame data. Reuse these buffers every frame instead of creating new arrays.

b. **Cache PixiJS display objects:** Ensure that each layer's constructor creates all the PIXI.Graphics, PIXI.Sprite, and PIXI.Text objects it will ever need, and the `update()` method only modifies properties (position, scale, alpha, tint, visible) on existing objects.

c. **Batch rendering:** Use `PIXI.ParticleContainer` for the car dots if they are simple circles/sprites with tinting — ParticleContainer can render thousands of sprites in a single draw call. If cars are complex (with labels, halos, etc.), use a regular `PIXI.Container` but ensure each layer is its own container and layers that don't change every frame (like `TrackAsphaltLayer`, `FinishLineLayer`, `CornersLayer`) are only rendered once and cached as a `PIXI.RenderTexture`.

d. **Avoid React re-renders at 60Hz:** Search for `useSessionStore`, `useSelectionStore`, or any store hook usage inside components that are in the render tree of `RaceWorkspace`. If any component selects frame-level data (like current car positions, current lap number, current flag status) via a hook, it will re-render every time that data changes (which is every frame at 60fps). Instead:
   - For the timing tower: it should update at most at the data frame rate (25Hz, or even throttled to 10Hz is fine for position updates). Use a `useEffect` with a `setInterval` or subscribe to store changes with a throttle.
   - For the race strip (flag status, lap number, weather): update at 1Hz or on change only.
   - For the context panel: update when the selected driver's data changes, which is at most 25Hz.
   - The PixiJS canvas itself reads from stores imperatively via `getState()` inside the render loop and never causes React re-renders.

**Step 3 — Font/texture memory:**

PixiJS loads font textures and glyph atlases. Ensure:
- If using `PIXI.BitmapText`, the bitmap font is loaded once and shared across all text objects
- If using `PIXI.Text` (HTML canvas based text), limit the number of unique `Text` objects and reuse them. Do not create new `Text` objects and discard old ones every frame.
- Check for texture leaks: if any layer destroys and recreates textures, ensure `.destroy(true)` is called on the old texture to free GPU memory.

### 3.3 Performance Mode

The `performanceMode` boolean already exists in `settingsStore.ts` (line 9). When this is true, the following visual features should be disabled to boost framerate on weak hardware:

1. **Trails:** In `web/src/render/layers/TrailsLayer.ts`, check `useSettingsStore.getState().performanceMode` at the start of the `update()` method. If true, set `this.container.visible = false` and return early.

2. **Glows/halos:** In `CarsLayer.ts`, skip rendering the selection halo glow effect. Just show a simple solid ring instead of a glowing/pulsing one.

3. **ML overlays on canvas:** In `MlOverlay.ts`, if `performanceMode` is true, set the container invisible.

4. **DPR cap:** In `TrackRenderer.ts` (or wherever the PixiJS `Application` is configured), if `performanceMode` is true, set `resolution` to `1` regardless of `window.devicePixelRatio`. This cuts the number of pixels the GPU renders by 4× on a 2× DPR display.

5. **Mini sectors:** In `MiniSectorsLayer.ts`, hide this layer in performance mode.

After implementing performance mode, measure FPS with it ON and OFF on the same scene. Record both numbers in the report. The expectation is at least a 15-20% FPS improvement.

### 3.4 Soak Test

Create a new Playwright test file at `web/e2e/soak.spec.ts`. This test is a long-running stress test:

**What the test does:**
1. Navigate to the race workspace with the fixture session (`/race/suzuka-2026-r3?fixture=suzuka-2026-r3`)
2. Wait for the workspace to fully load (all 20 drivers visible in the timing tower)
3. Record the initial memory usage using `page.evaluate(() => (performance as any).memory?.usedJSHeapSize)` (this API is Chromium-only, which is fine since we use `msedge` channel)
4. Set playback speed to 32× (simulate by dispatching keyboard shortcut `4` or clicking the speed control)
5. Let it play for 30 seconds of wall time (which covers a large chunk of the race at 32×)
6. Reduce speed to 1×
7. Let it play for 10 seconds
8. Scrub randomly 100 times: for each scrub, generate a random timestamp between 0 and the race duration, and set the playback position to that timestamp (either via the timeline click API, or by dispatching a seek event to the playback clock)
9. After all scrubs, check `page.evaluate(() => (performance as any).memory?.usedJSHeapSize)` again
10. Switch sessions 5 times: navigate to home, click a different session (or the same fixture session), wait for load, navigate back. (If only one fixture session is available, just reload the same one 5 times.)
11. Collect `console` events throughout the entire test. Assert:
    - Zero `console.error` entries (excluding known benign errors like React DevTools messages)
    - Zero unhandled promise rejections
    - Final memory is within 10% of initial memory (memory budget check)

**Configuration notes:**
- Set the Playwright test timeout to 5 minutes (`test.setTimeout(300_000)`)
- Use the `msedge` channel (already configured in `web/playwright.config.ts`)
- Add a separate npm script `"e2e:soak": "playwright test soak.spec.ts"` to `package.json`

### 3.5 Backend Performance Checks

**Cache headers:** Verify that the FastAPI backend serves frame chunks with proper HTTP cache headers. Open `src/web/routers/` and check the frame chunk endpoint. It should set `Cache-Control: public, max-age=86400, immutable` on chunk responses (since frame data for a completed session never changes). If the chunk data is served as binary, verify that `Content-Type: application/octet-stream` is set. If it is JSON, verify gzip compression is active (FastAPI/uvicorn supports gzip middleware — check if `GZipMiddleware` is added in `src/web/app.py`).

**304 responses:** If the client sends `If-None-Match` headers with ETags, the backend should respond with `304 Not Modified`. Check whether FastAPI's `FileResponse` or the chunk serving mechanism supports ETags. If not, this is acceptable but note it in the report.

---

## 4. ACCESSIBILITY PASS

### 4.1 Axe Audit on Every Route

You will run the axe accessibility scanner on every route and every state of the application. Here is the process:

**Step 1 — Install axe-playwright:**

Run `npm install -D @axe-core/playwright` in the `web/` directory.

**Step 2 — Create an accessibility test file at `web/e2e/a11y.spec.ts`:**

This file should test every route:

- `/` (home page) — in its loaded state with season data
- `/race/suzuka-2026-r3?fixture=suzuka-2026-r3` — in its loaded state with all panels visible
- `/quali/suzuka-2026-r3?fixture=suzuka-2026-r3` — in its loaded state with results visible
- `/settings` — with all sections expanded
- `/dev/gallery` — with all component examples visible

For each route:
1. Navigate to the route
2. Wait for the page to be fully loaded (no skeletons visible, data rendered)
3. Run `new AxeBuilder({ page }).analyze()`
4. Assert zero violations with `impact` of `"critical"` or `"serious"`

Also test these specific UI states:
- Dialog open state: open the session load modal on the home page, then run axe
- Dialog open state: open the clear cache confirmation dialog on the settings page, then run axe
- Popover open state: if any popovers exist (command palette, tooltips), open them and run axe
- Error state: trigger a network error (disable the backend) and run axe on the error state UI

**Step 3 — Fix every critical/serious violation:**

Common violations you are likely to encounter:
- **Missing aria-label on icon-only buttons:** Every `<Button>` that contains only an icon (from `lucide-react`) and no visible text MUST have an `aria-label` attribute describing the action. Search for `<Button` in all TSX files and check if any icon-only buttons lack labels. Fix by adding `aria-label="descriptive text"`.
- **Missing alt text on images:** If any `<img>` tags exist, they need `alt` attributes.
- **Color contrast failures:** If axe reports contrast failures, do NOT fix them by changing individual component colors. Instead, adjust the token values in `web/src/design/tokens.css`. Specifically:
  - `--text-3` (#9494a0) against `--surface-0` (#08080c) has a contrast ratio of about 5.8:1 — this should pass AA for normal text
  - `--text-2` (#c4c4cf) against `--surface-1` (#12121a) has about 10:1 — this passes
  - `--text-disabled` (#5c5c6a) is intentionally low contrast for disabled elements — axe may flag it but this is acceptable for disabled content (WCAG allows lower contrast for disabled controls)
  - If any semantic color (like `--success` #00d26a, `--warning` #ffd600, `--danger` #ff4d4f, `--best` #b138dd) used as text color fails contrast against its background, adjust the token to a lighter/brighter variant
- **Missing form labels:** Inputs, selects, and sliders need associated labels. Check the SettingsPage and any forms.
- **Missing table semantics:** The timing tower should use `role="table"`, `role="row"`, `role="cell"` (or semantic `<table>`, `<tr>`, `<td>`). If it uses divs, add the ARIA roles.

### 4.2 Keyboard-Only Walkthrough

You need to verify that a user can operate the entire application using only the keyboard (no mouse). Here is the exact walkthrough to perform and verify:

**Home Page:**
1. Press `Tab` — focus should land on the first interactive element (likely the year picker or first session card)
2. Continue tabbing — focus ring (a 2px white outline offset by 2px, using `--focus-ring` token) should be visible on every focused element
3. Press `Enter` on a session card — should trigger the session load modal
4. In the modal, `Tab` should move between buttons (Start, Cancel). `Escape` should close the modal and return focus to the triggering session card.
5. `Tab` should eventually reach the Settings gear icon and navigation links

**Race Workspace:**
1. Timing tower rows should be tabbable. Pressing `Enter` or `Space` on a driver row should select that driver (same as clicking).
2. Transport controls (play/pause, speed buttons, restart) should all be tabbable and operable with `Enter`/`Space`.
3. The keyboard shortcuts (Space = pause, ←/→ = jump, ↑/↓ = speed, 1-4 = set speed, R = restart, D = DRS zones, B = progress bar, L = driver labels, H = help) must all work regardless of which element has focus, unless a text input or dialog has focus.
4. `Escape` should deselect the current driver.
5. There should be no keyboard traps — pressing `Tab` should always eventually cycle through all interactive elements. Dialogs should trap focus within themselves (this is correct behavior) but `Escape` must always close them.

**Analysis Workspace:**
1. Panel tab headers in dockview should be tabbable and activatable with `Enter`.
2. If any chart is focused, there is no keyboard interaction expected (charts are visual), but they should not trap focus.

**Command Palette:**
1. The keyboard shortcut to open the command palette (likely `Ctrl+K` or `Cmd+K`) should work.
2. Once open, the search input should be auto-focused.
3. Arrow keys should navigate the results list.
4. `Enter` should activate the selected command.
5. `Escape` should close the palette and return focus to the previously focused element.

**Fix every issue found** by adding `tabIndex`, `role`, `aria-*` attributes, `onKeyDown` handlers, and focus management logic as needed. Record a checklist of every screen tested in the Phase 9 report.

### 4.3 Screen Reader Semantics

**Timing tower table semantics:** Ensure the timing tower component (`web/src/features/timing-tower/TimingTower.tsx`) uses proper table semantics. If it is built with divs, add:
- `role="table"` on the outer container
- `role="rowgroup"` on the header row container and body container
- `role="row"` on each driver row
- `role="columnheader"` on header cells
- `role="cell"` on data cells
- `aria-sort` on the position column header (it's always sorted by position ascending)
- `aria-label="Timing Tower"` on the table container
- Each row should have `aria-selected="true"` when the driver is selected

**Flag change announcements:** When the race flag status changes (green → yellow → red → SC → VSC → green), this change should be announced to screen readers. In the `RaceStrip.tsx` component (or wherever the flag status is displayed), add an `aria-live="polite"` region that contains text like "Yellow flag" or "Safety Car deployed". This region should update only when the flag status actually changes, not every frame.

**Key-moment jump announcements:** When the user triggers a key-moment jump (clicking a marker on the timeline), announce "Jumped to Lap 15 — Overtake: Verstappen passes Hamilton" (or whatever the moment description is) via an `aria-live="assertive"` region.

**Chart summaries:** Each chart in the analysis workspace should have an `aria-label` that summarizes its data. For example, a speed telemetry chart for VER vs HAM should have `aria-label="Speed telemetry comparison: VER average 298 km/h, HAM average 295 km/h, data from Lap 1 to Lap 53"`. Compute the min, max, and average from the chart data and construct this label dynamically.

**Icon button labels:** Every icon-only button must have `aria-label`. Search for all uses of `lucide-react` icons inside `<Button>` components and ensure each has a descriptive label. Examples:
- Play button → `aria-label="Play"`
- Pause button → `aria-label="Pause"`  
- Settings gear → `aria-label="Settings"`
- Close/X button → `aria-label="Close"`
- Camera reset → `aria-label="Reset camera view"`
- Speed up → `aria-label="Increase playback speed"`

### 4.4 Colorblind-Safe Mode

The `colorblindMode` boolean already exists in `settingsStore.ts` (line 11). When this is enabled, you need to augment color-coded elements with non-color visual cues:

**Tyre badges (`web/src/components/ui/TyreBadge.tsx`):**
When `colorblindMode` is true, each tyre compound badge should display a distinct shape in addition to the color and letter:
- Soft (S) — circle shape (already the default, keep it)
- Medium (M) — square/diamond shape (add a CSS `border-radius: 2px` to make it clearly square, or render a diamond icon)
- Hard (H) — triangle/hexagon shape (add a small SVG triangle next to or inside the badge)
- Intermediate (I) — pentagon or star shape
- Wet (W) — wavy line or water droplet icon

The simplest implementation: add a small 8×8 SVG icon next to the letter inside the badge. The SVG should use `currentColor` so it inherits the text color.

**Flag pills (`web/src/components/ui/FlagPill.tsx`):**
When `colorblindMode` is true, add a distinct pattern overlay or icon to each flag status:
- Green — checkered pattern or checkmark icon ✓
- Yellow — diagonal stripes pattern or warning triangle icon ⚠
- Red — cross-hatch pattern or X icon ✕
- SC — dotted pattern or "SC" text (likely already has text)
- VSC — dashed pattern or "VSC" text (likely already has text)

Implement the patterns as CSS `background-image` using `repeating-linear-gradient` for stripes/dots/crosshatch. These patterns should be subtle (low opacity, like 0.15-0.2) so they add information without overwhelming the visual.

**Sector timing cells (in `web/src/features/quali/QualifyingPage.tsx` and timing tower):**
When `colorblindMode` is true, sector cells that are color-coded purple/green/yellow should also display a symbol:
- Purple (overall best) — display a ★ star symbol before the time
- Green (personal best) — display a ▲ triangle before the time
- Yellow (slower) — display a ● dot before the time

The `sectorColors.ts` utility at `web/src/features/quali/sectorColors.ts` already has a `classifySector` function. Add a companion function `sectorSymbol(classification: string): string` that returns the appropriate symbol.

**Verification:** After implementing colorblind mode, take screenshots with it enabled. Then use Chrome DevTools → Rendering → "Emulate vision deficiencies" → select "Deuteranopia" and "Protanopia" and take screenshots of the same views. Save all screenshots to `docs/web-revamp/evidence/phase-9/colorblind/`. Verify that all information is distinguishable without relying on color alone.

### 4.5 Contrast Verification

**Step 1:** For every text token used as a foreground color, calculate the contrast ratio against every surface token it might appear on:

| Foreground | Background | Minimum Required | Check |
|---|---|---|---|
| `--text-1` (#ffffff) | `--surface-0` (#08080c) | 4.5:1 (normal text) | Calculate |
| `--text-1` (#ffffff) | `--surface-1` (#12121a) | 4.5:1 | Calculate |
| `--text-1` (#ffffff) | `--surface-2` (#1a1a24) | 4.5:1 | Calculate |
| `--text-2` (#c4c4cf) | `--surface-0` (#08080c) | 4.5:1 | Calculate |
| `--text-2` (#c4c4cf) | `--surface-1` (#12121a) | 4.5:1 | Calculate |
| `--text-2` (#c4c4cf) | `--surface-2` (#1a1a24) | 4.5:1 | Calculate |
| `--text-3` (#9494a0) | `--surface-0` (#08080c) | 4.5:1 | Calculate |
| `--text-3` (#9494a0) | `--surface-1` (#12121a) | 4.5:1 | Calculate |
| `--text-3` (#9494a0) | `--surface-2` (#1a1a24) | 4.5:1 | Calculate |
| `--text-3` (#9494a0) | `--surface-3` (#262634) | 3:1 (large text only) | Calculate |

If any combination fails its minimum ratio, adjust the TOKEN value (make the foreground lighter or the background darker/lighter) — do NOT hard-code a fix in any component.

**Step 2:** Check that UI element boundaries (borders of cards, buttons, input fields) have at least 3:1 contrast against adjacent colors:
- `--border` (#2c2c3a) against `--surface-1` (#12121a) — must be ≥ 3:1
- `--border` (#2c2c3a) against `--surface-2` (#1a1a24) — must be ≥ 3:1

### 4.6 Hit Targets

Search for all interactive elements (buttons, links, clickable areas) and verify their touch/click target sizes:
- Standard controls (buttons, toggles, sliders, dropdown triggers) → minimum 32×32 pixels
- Dense table rows (timing tower rows) → minimum 24px height (already `--row-height: 32px` in comfortable mode, `26px` in compact mode — both meet the 24px minimum)
- Icon-only buttons → minimum 32×32px. If any icon button is smaller than this, increase its padding

### 4.7 Respect `prefers-contrast`

Add a new `@media (prefers-contrast: more)` block in `web/src/design/tokens.css` (after the existing `prefers-reduced-motion` block). When the OS is set to high contrast mode:
- Increase border opacity: `--border: #4a4a5a;` (use the current `--border-strong` value)
- Increase `--text-3` brightness: `--text-3: #b0b0bc;`
- Make focus rings thicker: add a CSS rule `.focus-visible { outline-width: 3px; }` or increase the global focus ring from 2px to 3px

---

## 5. RESPONSIVE PASS

### 5.1 Viewport Testing Matrix

You must test the application at these exact viewport sizes and verify there are no visual issues:

| Width×Height | OS Scale | What to check |
|---|---|---|
| 1366×768 | 100% | Smallest supported. Timing tower may need compact mode. No horizontal scroll. All controls reachable. |
| 1440×900 | 100% | Common laptop. Standard layout. |
| 1920×1080 | 100% | Reference resolution. Everything should look perfect. |
| 1920×1080 | 125% | Common Windows default scaling. Verify no overlap, no clipped text. |
| 1920×1080 | 150% | High DPI Windows. Verify font sizes render correctly, no overlapping elements. |
| 2560×1440 | 100% | QHD monitor. Verify content doesn't stretch too wide. Add max-width constraints on charts and data panels. |
| 3440×1440 | 100% | Ultrawide monitor. The canvas should expand to fill space, but the timing tower (320px) and context panel (360px) should remain fixed width. Charts should not stretch beyond ~1200px width — add a `max-width` on chart containers. |

**For each viewport size, test these screens:**
1. Home page — calendar grid should reflow appropriately
2. Race workspace — timing tower, canvas, context panel layout
3. Qualifying page — results table and telemetry charts
4. Settings page — form layout
5. Analysis workspace — dockview panels

### 5.2 Create Responsive Test Script

Create a Playwright test file at `web/e2e/responsive.spec.ts` that:

1. Defines a list of viewports: `[{ width: 1366, height: 768 }, { width: 1440, height: 900 }, { width: 1920, height: 1080 }, { width: 2560, height: 1440 }, { width: 3440, height: 1440 }]`
2. For each viewport, navigates to each main route (home, race workspace, qualifying, settings) using the fixture session
3. Takes a full-page screenshot and saves it to `docs/web-revamp/evidence/phase-9/responsive/`
4. Runs a bounding-box check: for each viewport, assert that no element extends beyond the viewport width (no horizontal scroll). Do this by running `page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)`.

### 5.3 Layout Breakpoints

The design system defines these breakpoints (from `REF_DESIGN_SYSTEM.md`):
- `≥1600px` — full layout (tower 320px | canvas 1fr | context 360px)
- `1280–1599px` — context panel becomes collapsible to a narrow rail (40px wide showing only icons, clicking expands to full 360px width as an overlay)
- `<1280px` — tower shows abbreviated data (driver code + gap only, no tyre/pit columns), panels become drawer overlays that slide in from the right

Verify that `web/src/components/layout/RaceWorkspace.tsx` implements these breakpoints correctly. If it uses a hardcoded grid layout without responsive breakpoints, add them using CSS media queries or container queries:

- At `<1280px`: change the grid template to `"tower 240px | canvas 1fr"` and render the context panel as a slide-in drawer triggered by a button
- At `1280–1599px`: change to `"tower 280px | canvas 1fr | context-rail 40px"` with the context panel collapsible
- At `≥1600px`: keep the current `"tower 320px | canvas 1fr | context 360px"`

### 5.4 Browser Matrix

**Primary:** Chrome and Edge (latest stable) — all tests must pass and all visuals must be correct.

**Smoke test in Firefox:** Run the E2E smoke test (`web/e2e/smoke.spec.ts`) in Firefox. If there are WebGL issues (PixiJS may behave slightly differently in Firefox's WebGL implementation), note them in the report.

**WebGL unavailability:** Add an error state that appears when WebGL is not available. In `TrackCanvas.tsx` (or `TrackRenderer.ts`), if the PixiJS application fails to initialize due to missing WebGL support, catch the error and render an `ErrorState` component with the message "WebGL is not available in your browser. The track canvas requires WebGL to render. Please try Chrome or Edge." Do not crash the entire app — the rest of the UI (timing tower, timeline, etc.) should still work.

---

## 6. EXPORT / SHARE FEATURE

### 6.1 Export Snapshot (PNG)

**Goal:** A single button press (or keyboard shortcut `P`) captures the entire race workspace as a high-quality PNG image.

**Implementation plan:**

**Step 1 — Add the export button:**
In `web/src/features/transport/TransportControls.tsx` (or in the race workspace header), add a camera/download icon button with `aria-label="Export screenshot"`. Also register the `P` keyboard shortcut in the existing keyboard shortcut handler.

**Step 2 — Implement the capture logic:**
Create a new file `web/src/utils/exportSnapshot.ts`. This file exports an async function `captureWorkspace(options?: { scale?: 1 | 2 }): Promise<Blob>`.

The function needs to composite multiple sources into one image:
1. **PixiJS canvas:** Use `renderer.extract.canvas()` (PixiJS v8 API) to get the current canvas content as an `HTMLCanvasElement`. This gives you the track, cars, trails, labels — everything rendered by PixiJS.
2. **DOM panels:** The timing tower, race strip, context panel, and timeline are React DOM elements, not on the PixiJS canvas. To capture them, use the `html2canvas` library (or `dom-to-image-more`). Install it: `npm install html2canvas` (or `dom-to-image-more`).
   - **Important caveat:** `html2canvas` cannot capture PixiJS/WebGL content (it rasterizes DOM, not GPU content). This is why we need to composite separately.
3. **Compositing:** Create a new `OffscreenCanvas` (or regular `HTMLCanvasElement`) with the full workspace dimensions (e.g., 1920×1080 at 1× or 3840×2160 at 2×). Draw the PixiJS canvas extract into the appropriate position (where the canvas element sits in the grid layout), then draw the DOM captures of each panel into their respective positions.

**Alternative simpler approach (recommended):** Use Playwright's `page.screenshot()` API in a local capture mode. However, this requires Playwright to be running, which is not suitable for in-app export. So, go with the `html2canvas` + PixiJS extract compositing approach.

**Actually, the simplest reliable approach:** Capture only the PixiJS canvas with `renderer.extract.canvas()`, then overlay it with the DOM panels captured via `html2canvas`. The compositing order on the output canvas should be:
1. Fill with `--surface-0` background
2. Draw the PixiJS canvas content at the canvas region coordinates
3. Draw the timing tower DOM capture at the tower region coordinates
4. Draw the context panel DOM capture at the context panel region coordinates
5. Draw the race strip at the top
6. Draw the timeline/transport at the bottom

**Step 3 — File naming and download:**
Convert the final composited canvas to a Blob with `canvas.toBlob(blob, 'image/png')`. Create a download link:
```
const url = URL.createObjectURL(blob);
const a = document.createElement('a');
a.href = url;
a.download = `f1synapse_${eventName}_lap${currentLap}_${timestamp}.png`;
a.click();
URL.revokeObjectURL(url);
```

Where:
- `eventName` is derived from the session ID (e.g., `suzuka_2026_r3`)
- `currentLap` is the current lap number from the playback state
- `timestamp` is the current race timestamp formatted as `mm-ss` (minutes-seconds)

**Step 4 — Feedback:**
While the export is in progress (compositing can take 200-500ms), show a brief loading indicator or flash the export button. After successful export, show a success toast "Screenshot saved".

**Decision to record:** Record in `DECISIONS.md` that you chose `html2canvas` + PixiJS extract compositing over server-side Playwright rendering, with rationale: "Client-side compositing avoids Playwright dependency at runtime, works offline, and is fast enough for single screenshots."

### 6.2 Black Book Capture Script

Create a new file `scripts/capture_screens.ts`. This is a standalone Playwright script (NOT an E2E test) that generates a consistent set of high-quality screenshots for documentation/portfolio.

**Prerequisites:** The script should be run with `npx playwright test scripts/capture_screens.ts` or as a standalone `tsx` script with `npx tsx scripts/capture_screens.ts`.

Actually, make it a Playwright test file (easier to run):

**Create `web/e2e/capture-blackbook.spec.ts`** with:

1. **Race workspace hero shot:** Navigate to `/race/suzuka-2026-r3?fixture=suzuka-2026-r3`, wait for full load, seek to a visually interesting moment (e.g., a lap with yellow flag or close battle), take a 1920×1080 screenshot → `docs/web-revamp/evidence/black-book/race-workspace-hero.png`

2. **Battle focus with ML chip:** Select two drivers who are close together, zoom the camera to their position, take a screenshot showing the ML overlay chips → `docs/web-revamp/evidence/black-book/battle-ml-chips.png`

3. **Analysis presets:** Navigate to `/analysis/suzuka-2026-r3?fixture=suzuka-2026-r3`, load the "Race Engineer" preset, take a screenshot → `docs/web-revamp/evidence/black-book/analysis-race-engineer.png`. Load the "Strategist" preset, take another screenshot → `docs/web-revamp/evidence/black-book/analysis-strategist.png`.

4. **Home page:** Navigate to `/`, wait for load, take a screenshot → `docs/web-revamp/evidence/black-book/home-calendar.png`

5. **Qualifying:** Navigate to `/quali/suzuka-2026-r3?fixture=suzuka-2026-r3`, wait for results to load, take a screenshot → `docs/web-revamp/evidence/black-book/qualifying-results.png`. Select 2-3 drivers for telemetry comparison, take another screenshot → `docs/web-revamp/evidence/black-book/qualifying-telemetry.png`

6. **Settings:** Navigate to `/settings`, take a screenshot → `docs/web-revamp/evidence/black-book/settings.png`

All screenshots should be at 1920×1080 viewport with `deviceScaleFactor: 2` for retina quality (actual image will be 3840×2160).

Add an npm script: `"capture:blackbook": "playwright test e2e/capture-blackbook.spec.ts"` to `package.json`.

### 6.3 Optional: WebM Recording (Stretch Goal)

If you have time after completing everything else, implement a video recording feature:

1. Add a "Record" toggle button next to the export button
2. When activated, use `canvas.captureStream(30)` on the PixiJS canvas to get a `MediaStream`
3. Create a `MediaRecorder` with `mimeType: 'video/webm; codecs=vp9'`
4. Start recording. Show a red recording indicator.
5. When the user clicks "Stop Recording", call `mediaRecorder.stop()`, collect the chunks, create a Blob, and download it as `f1synapse_${eventName}_recording.webm`

Note: this only captures the canvas, not the DOM panels. This is acceptable for the stretch goal.

---

## 7. VISUAL REGRESSION & BUNDLE AUDIT

### 7.1 Visual Regression Baselines

**Step 1 — Create a visual regression test file at `web/e2e/visual.spec.ts`:**

For each key screen/state, take a screenshot and compare it against a committed baseline. Playwright has built-in visual comparison with `expect(page).toHaveScreenshot()`.

Test these exact screens (all using the fixture session for deterministic content):

1. Home page at 1920×1080 → baseline: `home-1920.png`
2. Race workspace at 1920×1080, seek to t=120s → baseline: `race-workspace-120s.png`
3. Race workspace at 1920×1080, seek to t=120s, driver VER selected → baseline: `race-workspace-ver-selected.png`
4. Qualifying page at 1920×1080 → baseline: `qualifying-results.png`
5. Settings page at 1920×1080 → baseline: `settings.png`

**Step 2 — Configure Playwright for visual regression:**

In `web/playwright.config.ts`, add:
- `expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.01 } }` — allow 1% pixel difference to account for font rendering variations across systems
- Set a `snapshotDir` pointing to `web/e2e/__screenshots__/`

**Step 3 — Generate baselines:**

Run `npx playwright test visual.spec.ts --update-snapshots` to generate the initial baseline screenshots. Commit these baselines to the repository.

**Step 4 — Add npm script:**

Add `"e2e:visual": "playwright test visual.spec.ts"` to `package.json`.

### 7.2 Bundle Size Audit

**Step 1 — Analyze the bundle:**

Run `npx vite build` and note the output sizes. Then use `rollup-plugin-visualizer` (already added as a dev dependency in step 3.1) to generate a treemap.

**Step 2 — Identify and remove unused dependencies:**

Check `package.json` for any dependency that is no longer imported by any file:
- Search for `import ... from 'symbol-tree'` — if `symbol-tree` is not imported anywhere in `web/src/`, remove it from dependencies
- Search for any other package that has zero imports

Run `npx depcheck` (install it temporarily: `npx depcheck`) to find unused dependencies automatically.

**Step 3 — Identify unused components:**

For each component exported from `web/src/components/index.ts`, search for its usage across all TSX files. If a component is exported but never imported anywhere except the barrel file and the DevGallery, it is still potentially useful (gallery is the showcase), but note it in the report.

For files outside the component library (in `web/src/features/`, `web/src/pages/`, etc.), if any file is not imported from any route or any other file, delete it. This follows the "replace = delete" rule from the master plan.

**Step 4 — Record bundle metrics:**

Create a table in the Phase 9 report:

| Chunk | Raw Size | Gzip Size | Contents |
|---|---|---|---|
| index (entry) | ? KB | ? KB | React, router, home page |
| vendor-pixi | ? KB | ? KB | pixi.js |
| vendor-uplot | ? KB | ? KB | uplot |
| vendor-dockview | ? KB | ? KB | dockview-react |
| vendor-radix | ? KB | ? KB | @radix-ui/* |
| Total | ? KB | ? KB | — |

The "Initial load (home)" line must be the entry chunk + vendor-radix (since Radix components are used on the home page). This must be < 400 KB gzip.

---

## 8. FINAL VERIFICATION & REPORT

### 8.1 Run All Tests

Before writing the report, run all tests and record their output:

1. `npm run typecheck` — must show 0 errors
2. `npm run lint` — must show 0 warnings and 0 errors
3. `npm run test` — must show all vitest tests passing (record exact count)
4. `npm run e2e` — must show all Playwright tests passing (record exact count)
5. `npm run e2e:visual` — must pass (baselines match)
6. `npm run e2e:soak` — must pass (no console errors, memory within budget)
7. `npm run build` — must succeed, record chunk sizes
8. Backend: `pytest tests/web/` — must show all tests passing (record exact count)

### 8.2 Generate Evidence

Save all evidence to `docs/web-revamp/evidence/phase-9/`:

1. **Performance traces:** Save Chrome Performance trace JSON exports
2. **Axe reports:** Save axe scan results as JSON
3. **Soak test output:** Save console output showing memory measurements
4. **Screenshot matrices:** Save responsive viewport screenshots
5. **Colorblind simulation screenshots**
6. **Bundle treemap HTML**
7. **Black book capture images**

### 8.3 Write the Phase Report

At the end, append a Phase 9 report (following the format from `00_MASTER_PLAN.md` section 7):

```
## Phase 9 report
- Done: …
- Acceptance criteria:
  [x] AC1: Performance table filled with measured numbers; all budgets met (or deviations justified)
  [x] AC2: Soak test passes with no console errors and flat memory
  [x] AC3: axe reports zero serious/critical issues on all routes; keyboard walkthrough completed
  [x] AC4: Colorblind mode verified with simulation screenshots; reduced-motion verified
  [x] AC5: All screens correct at 5 viewport sizes and 2 OS scales
  [x] AC6: Every async boundary has loading/empty/error states; no placeholder values
  [x] AC7: Export produces correct PNGs; capture script generates the black-book set
  [x] AC8: Visual regression baselines committed; `npm run e2e:visual` passes
  [x] AC9: Bundle budget met; no unused dependencies
- Deviations from the plan: …
- New decisions (added to DECISIONS.md): …
- Out-of-scope findings (added to NOTES.md): …
- Open questions for the owner: …
```

### 8.4 Commit Strategy

Commit your changes in small, focused commits on the `web/phase-9-polish` branch:

1. `feat(web): motion audit — standardize all animations to motion tokens`
2. `feat(web): state audit — add loading/error/empty states to all screens`
3. `feat(web): add toast notification system with sonner`
4. `feat(web): code-split routes and heavy vendor chunks`
5. `perf(web): optimize canvas render loop — preallocate buffers, cache display objects`
6. `feat(web): add soak test for memory and stability`
7. `feat(web): performance mode — disable trails, glows, ML overlays, cap DPR`
8. `fix(a11y): axe violations — add aria labels, table semantics, focus management`
9. `feat(a11y): keyboard-only navigation — tab order, focus rings, shortcut handlers`
10. `feat(a11y): colorblind-safe mode — tyre shapes, flag patterns, sector symbols`
11. `feat(a11y): screen reader semantics — aria-live regions, chart summaries`
12. `fix(web): responsive layout — breakpoints for 1280/1600px, max-width constraints`
13. `feat(web): export snapshot — PNG capture with canvas + DOM compositing`
14. `feat(web): black book capture script`
15. `test(web): visual regression baselines`
16. `chore(web): bundle audit — remove unused deps, record sizes`
17. `docs(web): phase 9 report with measured evidence`

Use conventional commit messages. Each commit should pass `typecheck` and `lint`.

---

## APPENDIX A — Complete File Inventory

Here are all the files you will need to read and potentially modify, organized by task:

### Motion Audit Files
- `web/src/design/tokens.css` — motion token definitions (lines 106-129)
- `web/src/index.css` — global styles
- `web/src/components/ui/*.tsx` — all 25 UI components (check each for transitions)
- `web/src/features/timing-tower/TimingTower.tsx` — position swap animations
- `web/src/features/timeline/TimelineMarker.tsx` — hover animation
- `web/src/features/race-strip/RaceStrip.tsx` — flag pill animations
- `web/src/features/context-panel/ContextPanel.tsx` — panel animations
- `web/src/features/home/SessionLoadModal.tsx` — modal animation
- `web/src/render/layers/*.ts` — all 14 render layers (canvas animations)
- `web/src/render/TrackRenderer.ts` — render loop
- `web/src/stores/settingsStore.ts` — reducedMotion flag

### State Audit Files
- `web/src/features/home/HomePage.tsx`
- `web/src/features/home/SessionLoadModal.tsx`
- `web/src/components/layout/RaceWorkspace.tsx`
- `web/src/features/analytics/AnalysisWorkspace.tsx`
- `web/src/features/analytics/panelWrappers.tsx`
- `web/src/features/analytics/panels/*.tsx` — all 7 analysis panels
- `web/src/features/quali/QualifyingPage.tsx`
- `web/src/features/settings/SettingsPage.tsx`
- `web/src/features/timing-tower/TimingTower.tsx`
- `web/src/features/context-panel/ContextPanel.tsx`
- `web/src/features/race-strip/RaceStrip.tsx`
- `web/src/features/timeline/RaceTimeline.tsx`
- `web/src/features/transport/TransportControls.tsx`

### Performance Files
- `web/vite.config.ts` — code splitting config
- `web/src/App.tsx` — lazy imports
- `web/src/render/TrackRenderer.ts` — render loop optimization
- `web/src/render/layers/CarsLayer.ts` — car rendering optimization
- `web/src/render/layers/TrailsLayer.ts` — trail rendering optimization
- `web/src/render/layers/LabelsLayer.ts` — text object caching
- `web/src/stores/sessionStore.ts` — check for 60Hz React re-render triggers
- `web/package.json` — add soak test script

### Accessibility Files
- All TSX files containing `<Button` — check for aria-labels
- `web/src/features/timing-tower/TimingTower.tsx` — table semantics
- `web/src/features/race-strip/RaceStrip.tsx` — aria-live for flags
- `web/src/components/ui/TyreBadge.tsx` — colorblind shapes
- `web/src/components/ui/FlagPill.tsx` — colorblind patterns
- `web/src/features/quali/sectorColors.ts` — colorblind symbols
- `web/src/design/tokens.css` — contrast fixes, prefers-contrast

### Export Files (new)
- `web/src/utils/exportSnapshot.ts` — NEW: capture logic
- `web/src/features/transport/TransportControls.tsx` — add export button
- `web/e2e/capture-blackbook.spec.ts` — NEW: black book script

### Test Files (new)
- `web/e2e/soak.spec.ts` — NEW: soak test
- `web/e2e/a11y.spec.ts` — NEW: accessibility tests
- `web/e2e/responsive.spec.ts` — NEW: responsive tests
- `web/e2e/visual.spec.ts` — NEW: visual regression

### Toast System Files (new)
- `web/src/utils/toast.ts` — NEW: toast helpers
- `web/src/App.tsx` — add Toaster component

---

## APPENDIX B — NPM Packages to Install

```
# Production dependencies
npm install sonner html2canvas

# Dev dependencies
npm install -D @axe-core/playwright rollup-plugin-visualizer
```

---

## APPENDIX C — Design Tokens Quick Reference

These are the current values in `web/src/design/tokens.css` that you will reference throughout:

**Surfaces:** `--surface-0: #08080c` · `--surface-1: #12121a` · `--surface-2: #1a1a24` · `--surface-3: #262634` · `--surface-4: #323244`

**Text:** `--text-1: #ffffff` · `--text-2: #c4c4cf` · `--text-3: #9494a0` · `--text-disabled: #5c5c6a`

**Borders:** `--border: #2c2c3a` · `--border-hi: #444458` · `--border-strong: #46465c`

**Accent:** `--accent: #e10600` · `--accent-hover: #f5201b` · `--focus-ring: #ffffff`

**Semantic:** `--success: #00d26a` · `--warning: #ffd600` · `--danger: #ff4d4f` · `--best: #b138dd` · `--insight: #a855f7`

**Motion:** `--dur-fast: 120ms` · `--dur-base: 200ms` · `--dur-slow: 320ms` · `--ease-out: cubic-bezier(0.2, 0.8, 0.2, 1)` · `--ease-in-out: cubic-bezier(0.4, 0, 0.2, 1)`

**Typography:** `--font-display: 'Titillium Web'` · `--font-sans: 'Inter'` · `--font-mono: 'JetBrains Mono'`

**Spacing (4px base):** `--sp-1:4px` · `--sp-2:8px` · `--sp-3:12px` · `--sp-4:16px` · `--sp-5:24px` · `--sp-6:32px` · `--sp-7:48px`

**Radius:** `--r-sm:4px` · `--r-md:8px` · `--r-lg:12px` · `--r-pill:999px`

---

## APPENDIX D — Available UI Components

These are the 25 components exported from `web/src/components/index.ts`. Use them — do not create duplicates:

`Button` · `Badge` · `Chip` · `TyreBadge` · `FlagPill` · `DriverChip` · `Card` · `PanelHeader` · `Tabs` · `Segmented` · `Toggle` · `Slider` · `Tooltip` · `Popover` · `Dialog` · `Menu` · `Gauge` · `StatBar` · `Sparkline` · `Skeleton` · `EmptyState` · `ErrorState` · `Kbd` · `ProgressBar` · `Wordmark`

---

## APPENDIX E — Zustand Stores

**settingsStore** (`web/src/stores/settingsStore.ts`):
- `units: 'metric' | 'imperial'`
- `volume: number`
- `density: 'comfortable' | 'compact'`
- `trailsLength: number`
- `performanceMode: boolean`
- `reducedMotion: boolean`
- `colorblindMode: boolean`
- `cacheLocation: string`
- `computedDataLocation: string`
- `savedLayouts: Record<string, string>`
- `activeLayout: string`
- `showMlInsights: boolean`
- `showTrackMlChips: boolean`

**sessionStore** (`web/src/stores/sessionStore.ts`) — session data, drivers, frames

**selectionStore** (`web/src/stores/selectionStore.ts`) — selected driver(s)

**mlStore** (`web/src/stores/mlStore.ts`) — ML prediction data

**uiStore** (`web/src/stores/uiStore.ts`) — UI state (panels, dialogs)

---

## APPENDIX F — Existing E2E Test Files

These tests already exist and must continue to pass after your changes:
- `web/e2e/smoke.spec.ts`
- `web/e2e/canvas.spec.ts`
- `web/e2e/phase-4-tower-hud.spec.ts`
- `web/e2e/phase-5-timeline.spec.ts`
- `web/e2e/phase-6-analytics.spec.ts`
- `web/e2e/phase-7-ml.spec.ts`
- `web/e2e/phase-8-home-quali.spec.ts`
- `web/e2e/capture-before.spec.ts`
- `web/e2e/capture-after.spec.ts`

---

## APPENDIX G — Routes

| Path | Component | File |
|---|---|---|
| `/` | HomePage | `web/src/features/home/HomePage.tsx` |
| `/race/:sid` | RaceWorkspace | `web/src/components/layout/RaceWorkspace.tsx` |
| `/analysis/:sid` | AnalysisWorkspace | `web/src/features/analytics/AnalysisWorkspace.tsx` |
| `/quali/:sid` | QualifyingPage | `web/src/features/quali/QualifyingPage.tsx` |
| `/settings` | SettingsPage | `web/src/features/settings/SettingsPage.tsx` |
| `/dev/gallery` | DevGallery | `web/src/pages/DevGallery.tsx` |

---

## APPENDIX H — Critical Gotchas

1. **TestClient base_url:** Backend tests must use `TestClient(app, base_url="http://127.0.0.1:8000")` — without this, requests return 400 with `invalid_host`.

2. **Dialog component:** `Dialog` from `@/components` is Radix `DialogPrimitive.Root`. Content must be wrapped in `<DialogContent>` with `<DialogHeader>` and `<DialogTitle>` for the title to be visible in the DOM.

3. **No work at 60Hz in React:** The playhead/car positions must NEVER live in React state. Read from stores via `getState()` inside the PixiJS render loop.

4. **Replace = delete:** When you supersede something, delete the old version in the same commit.

5. **Fixture mode:** E2E tests use `?fixture=suzuka-2026-r3` URL parameter. The backend is NOT started by Playwright — fixture data is served from `web/fixtures/`.

6. **Position sort:** Position is determined by cumulative `dist` descending. Never reintroduce `(lap, dist)` sort.

7. **No F1 logo or proprietary fonts.** Use the `F1 SYNAPSE` wordmark only with self-hosted open-license fonts.

8. **Token-only color changes:** If you need to adjust a color for accessibility, change the token value in `tokens.css`, not the component.
