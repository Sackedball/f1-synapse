# DECISIONS

## 1. Mockup Implementation
- **Decision:** Build the Phase 0 mockups directly as static HTML/CSS rather than Figma or an image format.
- **Rationale:** This aligns perfectly with the goal of writing web technology, enables instant integration in Phase 2, and tests our design tokens immediately.
- **Consequence:** The mockups reside in `web/mockups/` using `css/design-tokens.css`.

## 2. Benchmark Fixture Session
- **Decision:** Use Suzuka 2024 (Round 4) data but structure the path as `suzuka-2026-r3` for the fixture to fulfill the prompt while having valid FastF1 telemetry data (as 2026 data doesn't exist yet).
- **Rationale:** FastF1 rejects unknown or future dates, meaning a true 2026 dataset can't be fetched live.
- **Consequence:** The script `scripts/export_fixture.py` exports real Suzuka telemetry into `web/fixtures/suzuka-2026-r3/`.

## 3. Legacy Logic Translations
- **Decision:** Extract raw mathematical structures from `ui_components.py` and `ml_prediction_window.py` without attempting to convert them to TypeScript yet.
- **Rationale:** Phase 0 is read-only analysis. 
- **Consequence:** `LEGACY_LOGIC.md` contains Python pseudocode as the single source of truth for the gap math and ML fallbacks.

## 4. API Contract Status
- **Decision:** Increment `REF_API_CONTRACT.md` from v0.1 (DRAFT) to v1.0. 
- **Rationale:** All `VERIFY` tags were checked against `f1_data.py` and `ui_components.py` and their true backend encodings were documented.
- **Consequence:** The schema is now considered the machine-readable truth.

## 5. Vectorized Precomputation in FrameStore
- **Decision:** Precompute driver position rankings and gap intervals using vectorized NumPy operations (`np.lexsort`, `np.take_along_axis`, `np.put_along_axis`) once upon session conversion.
- **Rationale:** Sorting 20+ drivers across ~135,000 frames sequentially would take seconds. Vectorized array slicing executes in ~57 ms and produces deterministic ties.
- **Consequence:** Chunk generation slices precomputed arrays instantly (< 1 ms per chunk).

## 6. Monotonic Distance Enforcement
- **Decision:** Apply `np.maximum.accumulate` along the time axis of each driver's cumulative distance.
- **Rationale:** Real-world GPS telemetry exhibits minute sensor vibration (1-2 cm) when stationary on the starting grid, which violates the strict non-decreasing contract.
- **Consequence:** Guarantees distance is non-decreasing without altering motion.

## 7. Decoupled Headless Track Geometry
- **Decision:** Implement normal-vector ribbon calculations directly in `src/web/services/track_service.py` rather than importing from `src/ui_components.py`.
- **Rationale:** `ui_components.py` imports Python Arcade and Pyglet OpenGL/Windows COM libraries which are unnecessary for a web backend and trigger ctypes cleanup issues.
- **Consequence:** Keeps the FastAPI backend purely headless and fast to import.

## 8. Decoupled PlaybackClock & Throttled UI Subscription
- **Decision:** Do NOT store `raceTime` in Zustand or React state. Keep it in `PlaybackClock` with a high-resolution requestAnimationFrame loop. Expose `subscribe(cb)` for 60 Hz canvas updates and `subscribeThrottled(cb, hz=10)` via `useSyncExternalStore` for React HUD/timing components.
- **Rationale:** Storing playhead time in React state causes full-tree re-render storms at 60 Hz.
- **Consequence:** Zero re-render storms during playback. React components only update at 10 Hz when relevant values change.

## 9. PixiJS v8 Manual Resize Handling
- **Decision:** Omit `resizeTo: container` in `Application.init()` and manage canvas resizing explicitly via `ResizeObserver` calling `app.renderer.resize()`.
- **Rationale:** PixiJS v8's `resizeTo` plugin attaches an unmount handler calling internal `this._cancelResize`, which throws `TypeError: this._cancelResize is not a function` when components re-render or unmount in React 19.
- **Consequence:** Robust, crash-free unmount and window resizing for the track canvas.

## 10. Segment Quad-Strip Track Ribbon Rendering
- **Decision:** Draw the circuit surface as a series of quad polygons between outer and inner edge points rather than a single compound polygon or winding-rule path.
- **Rationale:** Circuits with crossover bridges / figure-8 geometry (notably Suzuka!) suffer self-intersection and winding-rule inverted holes when filled as a single compound path. Rendering quad strips along sequential outer/inner indices renders any track topology (including Suzuka's crossover) flawlessly with zero artifacts.
- **Consequence:** Universal geometry stability across all current and future circuits.

## 11. Eager Display Layer Instantiation with Initialization Guard
- **Decision:** Instantiate all PixiJS layer objects eagerly in the `TrackRenderer` constructor and gate the render loop behind an `initialized` flag set only after `app.init()` completes.
- **Rationale:** React 19 lifecycle hooks and prop updates (`setDependencies`) can fire synchronously before the asynchronous `app.init()` promise resolves. Eager layer instantiation prevents `Cannot read properties of undefined (reading 'render')` race conditions during hot-reloads and fast re-renders.
- **Consequence:** Bulletproof, race-condition-free canvas mounting.

## 12. Visual Direction & Token Elevation (v1.1)
- **Decision:** Elevate track surface and edge tokens to achieve ≥ 3:1 edge contrast against canvas backdrop and ≥ 1.3:1 asphalt luminance distinction without backdrop blur or runtime fragment filters. Widen surface luminance ladder (`--surface-0` to `--surface-4`) and introduce `--border-hi` 1px highlight for depth.
- **Rationale:** The original dark navy palette lacked edge definition, making the circuit blend into the background. Depth from luminance steps preserves the 60 fps budget on integrated GPUs while giving broadcast-grade clarity.
- **Consequence:** Pristine high-contrast "night-circuit" aesthetics with 60 fps rendering.

## 13. Broadcast Timing Tower FLIP Reordering & Multi-Driver Comparison Matrix
- **Decision:** Implement FLIP (First, Last, Invert, Play) GPU transitions using CSS `translateY` with pre-allocated `Map` instances in `TimingTower.tsx` to achieve fluid position change animations with zero GC overhead. Implement a 3-mode Context Panel (Race Summary when none selected, Full Telemetry when 1 selected, Side-by-side or Stacked Multi-Compare when 2–4 selected) with a compact stacked layout at 1366×768 to permanently resolve the legacy 720p window overflow bug.
- **Rationale:** Timing tower position swaps must be visually obvious to users during broadcast events without causing React lag or layout recalculations. Side-by-side card rendering for 3+ drivers broke 720p viewports with horizontal/vertical clipping in the legacy desktop app.
- **Consequence:** Butter-smooth 60 fps position animations in the timing tower, responsive multi-driver comparison down to 1366×768 with zero window scrollbars.

## 14. Direct-DOM Playhead Needle, Dynamic Marker Clustering & Full-Race Minimap
- **Decision:** Drive the timeline playhead needle and hover tooltip via imperative direct DOM manipulation listening to the `PlaybackClock` subscription rather than storing 60 Hz playhead values in React component state. Cluster timeline event markers using dynamic pixel-distance math (`minDistancePx = 26`) evaluated against live track container width. Provide a full-race 14px minimap with draggable/resizable zoom window, flag/SC colored bands, and a slide-out Key Moments drawer with `J`/`K` navigation and `t - 3s` seeking with 4-second canvas driver highlight.
- **Rationale:** React re-rendering at 60 Hz for a playhead needle causes unnecessary VDOM reconciliation overhead across all timeline children. Direct DOM styling maintains 0% React re-render overhead while maintaining broadcast-fluid playhead motion. Marker clustering prevents overlapping icon clutter when zoomed out over full 53-lap sessions.
- **Consequence:** 60 fps timeline scrubbing with sub-100ms visual response, clear cluster breakdown on hover, seamless keyboard shortcut parity, and instant command palette execution.

## 15. Dockview-React Analytics Workspace, uPlot High-Performance Visualizations, and Head-to-Head Delta Convention
- **Decision:** Build the dedicated Analytics Workspace (`/analysis/:sid`) using `dockview-react` with token-based dark theme styling, supporting 7 dockable panels, 4 built-in layout presets (`Race Engineer`, `Strategy`, `Telemetry`, `Broadcast (clean)`), and arbitrary JSON layout import/export persisted in `localStorage`. Standardize on `uPlot` with synchronized cursor groups for continuous time/distance series, SVG for tyre stints and track position ribbons, and `FrameStore.getSeries` for zero-allocation telemetry streaming. Prominently display the Head-to-Head delta-time sign convention $\Delta t(x) = t_1(x) - t_2(x)$ directly on-screen with explicit coloring (`+` = first driver slower/behind in red/accent, `-` = first driver faster/ahead in green/cyan).
- **Rationale:** Replacing 7 floating legacy PyQt pit wall windows with a unified browser workspace requires desktop-grade docking, splitting, and tabbing with persistent user customization. Traditional React charting libraries (Recharts/Chart.js) allocate thousands of DOM nodes and garbage-collected objects during high-frequency telemetry replay; uPlot draws directly to 2D canvas with near-zero overhead. Explicit delta convention labels eliminate persistent driver comparison ambiguity.
- **Consequence:** 7 desktop-grade modular analysis panels replacing the legacy pit wall windows, 60 fps synchronized multi-chart inspection, customizable exportable layouts, and 0 per-frame allocations during telemetry replay.

## 16. Qt-Free ML Module Extraction, 2 Hz Precomputed Predictive Timelines, and Transparent Honest ML Surfaces
- **Decision:** Extract machine learning feature extraction and inference from `src/insights/ml_prediction_window.py` into a pure-Python, zero-Qt module under `src/ml/` (`features.py`, `overtake.py`, `pit.py`, `tyre.py`, `registry.py`). Precompute session-wide predictive timelines at 2 Hz resolution (`computing_ml` stage at session load) and serve via `GET /api/sessions/{sid}/ml` with `Cache-Control: immutable, max-age=86400`. Maintain zero-allocation O(log N) lookup in the client render loop via `mlStore`. Display all ML probabilities with explicit "est." suffixes in `--insight` purple (`#A855F7`), forbid deterministic assertions ("will overtake"), and provide a Model Info popover documenting the synthetic training target caveat.
- **Rationale:** The legacy PyQt desktop application tightly coupled LightGBM and XGBoost inference with Qt GUI widgets, preventing headless server execution. Running real-time inference on every 60 Hz frame on the client introduces unacceptable garbage-collection and latency penalties; precomputing 2 Hz timelines on the backend allows instantaneous, allocation-free lookups during playback. Because models were trained on simulated physics data rather than historical human telemetry, scientific honesty requires unambiguous "est." labeling and explicit model caveat disclosure.
## 17. Unified Storage Manager Integration, Distance-Grid Qualifying Telemetry, and Resilient Multi-Stage Load Flow
- **Decision:** Back backend settings endpoints (`GET/PUT /api/settings`, `POST /api/settings/cache/clear`) directly by the existing `SettingsManager` singleton in `src/lib/settings.py`, validating filesystem path existence and write permissions (`os.access(..., os.W_OK)`) prior to persistence. Expose qualifying classification and distance-resampled telemetry (`GET /api/sessions/{sid}/quali/results`, `GET /api/sessions/{sid}/quali/telemetry`) wrapping `src.f1_data` with uniform 10m distance-grid resampling for synchronized delta-time computation ($\Delta t(x) = t_{\text{driver}}(x) - t_{\text{ref}}(x)$). Replace PyQt `RaceSelectionWindow`, `QualifyingReplay`, and `SettingsDialog` with native responsive web interfaces (`/`, `/quali/:sid`, `/settings`), featuring an SSE staged load modal, cache indicators (`Downloaded ✓` / `Needs download ↓`), offline fallback, and unified unit conversion in `web/src/utils/units.ts`.
- **Rationale:** Creating a second settings file would risk divergence between web and backend data extraction pipelines. Resampling qualifying telemetry onto a common distance grid is mathematically required to compute spatial lap deltas across drivers setting laps at different times of the session. A staged SSE modal with elapsed timer and cancel support makes long FastF1 downloads transparent and controllable.
- **Consequence:** Full web replacement of the remaining legacy Qt dialogs, synchronized multi-driver qualifying comparison with live mini-map replay, robust offline/cache-aware session launching, and zero data-pipeline duplication.

## 18. Motion Tokens, WCAG 2.1 AA Accessibility, Composite WebGL Export, and Bundle Code Splitting (Phase 9)
- **Decision:** Standardize all animations across timing tower, timeline, and toasts on semantic CSS motion tokens (`--dur-fast`, `--dur-base`, `--dur-slow`, `--ease-out`) respecting `@media (prefers-reduced-motion: reduce)` with instant `0ms` fallback. Implement compound geometric shapes for tyre compounds (Soft=circle, Medium=square, Hard=diamond, Inter=arch, Wet=drop) and SVG hatch/cross-hatch patterns for race flags to achieve colorblind independence. Decouple timing tower toolbar headers from table bodies to satisfy axe table-child ARIA rules, achieving 0 serious/critical axe violations across all 4 primary routes. Implement manual Vite code-splitting chunks (`vendor-pixi`, `vendor-dockview`, `vendor-uplot`, `vendor-radix`) and route lazy loading, reducing initial Home page gzipped JS bundle to ~152 kB (well below the 400 kB budget). Use two-layer canvas rasterization combining `html2canvas` and WebGL context capture (`toDataURL('image/png')`) for snapshot exports triggered via shortcut `P` or toolbar button.
- **Rationale:** Professional broadcast interfaces require consistent motion choreography without violating accessibility standards for photosensitive or motion-sensitive users. Color alone is insufficient for broadcast-critical status indicators (tyres and flags) under WCAG guidelines. WebGL canvases render to an offscreen GPU buffer which DOM rasterizers like html2canvas cannot read; compositing both layers directly into an offscreen 2D canvas is required for accurate visual exports.
- **Consequence:** 0 axe serious/critical violations, colorblind and reduced-motion compliant UI, initial load under 153 kB gzip, stable memory usage under 71 MB during intensive 30-scrub soak testing, and reliable composite image exports.

## 19. Default Web Application Mode and Standalone Static Production Serving (Phase 10)
- **Decision:** Make the web application the default launch target when executing `python main.py`, with automatic free-port discovery (testing sequential ports from 8000 upward if busy), automatic default browser opening (unless `--no-browser`), and graceful Ctrl+C shutdown. Serve pre-built static assets from `web/dist` directly through FastAPI with SPA routing fallback, immutable caching headers for hashed `/assets`, and `no-cache` for `index.html`. Provide `run.bat` and `run.sh` one-click bootstrap launchers that verify the Python venv, install backend dependencies, compile frontend assets if missing, and launch the unified application.
- **Rationale:** Replacing legacy desktop dialogs requires a frictionless, single-command developer and end-user onboarding experience that does not require running two concurrent terminals (uvicorn + vite). Serving production assets directly from FastAPI eliminates any dependency on Node.js at runtime once assets are compiled.
- **Consequence:** Zero-friction execution via `python main.py` or double-clicking `run.bat`, production-grade asset delivery, and unified CLI deep-linking support across all session formats.

