# NOTES

## Phase 0 Findings & Out of Scope Discoveries

### Track Rotation
- The API Contract originally included `rotationDeg` to match the track orientation to broadcast angles.
- **Finding:** The legacy application (`build_track_from_example_lap` in `ui_components.py`) just plots raw X and Y from FastF1 telemetry. No rotation transformations are applied in the backend to match real-world broadcasts. 
- **Out of Scope Fix:** Added a note to `REF_API_CONTRACT.md` that it is 0/Not provided by legacy, rather than writing a rotation detection algorithm.

### Sector Boundaries
- The API Contract listed `sectors` as an array of centerline indices.
- **Finding:** FastF1 provides `Sector1Time`, `Sector2Time`, etc., but identifying the exact telemetry index where Sector 1 ends and Sector 2 begins is not done natively in the backend geometry logic.
- **Out of Scope Fix:** Marked it as optional in the contract. Future frontend/backend can interpolate the time against the track's cumulative distance to find the boundary indices.

### Telemetry Payload Extensibility
- We observed that `inPit` and `status` are passed natively but DNF status specifically relies on checking `rel_dist == 1` in the frontend (legacy `LeaderboardComponent.draw`). We might want to standardize a `status` code instead for better maintainability in the future phases.

### Transport Benchmark
- Worst case uncompressed binary frame (20 drivers) is 830 bytes per frame.
- For 60 seconds (1500 frames), the uncompressed binary is ~1.2MB.
- Compressed (GZIP) will easily yield 30-50% reductions for real continuous float data, making the 60s chunks very lightweight for initial loads over WebSocket or REST.

## Phase 1 Findings

### Decoupling `track_service` from `ui_components.py`
- `ui_components.py` imports `arcade` which pulls in `pyglet` and Windows COM/ctypes sound libraries that produce deprecation warnings and shutdown segfaults under modern Python 3.14 on Windows.
- The normal-vector track ribbing mathematics (`build_track_from_example_lap`) does not depend on Arcade at all. We implemented the pure NumPy vector algorithm in `src/web/services/track_service.py` to keep the FastAPI web backend completely headless and decoupled from GUI/audio libraries.

### Monotonic Distance Accumulation
- In real-world telemetry, cars stationary on the grid before race start can exhibit sub-centimeter GPS sensor noise (e.g. -0.018 m jitter).
- We applied `np.maximum.accumulate` across each driver's cumulative distance array in `FrameStore.from_frames`, strictly enforcing monotonic non-decreasing distance per driver across all frames while preserving true motion.

## Phase 2 Findings

### Vitest Test File Exclusions
- Vitest's default file pattern matches `**/*.spec.ts`, which picked up Playwright's `e2e/smoke.spec.ts`.
- Configured `exclude: ['**/node_modules/**', '**/e2e/**', '**/dist/**']` in `web/vitest.config.ts` so unit and end-to-end runners remain completely separated.

### Windows Path Resolution in Vite Connect Middleware
- In Connect middleware mounted at `/fixtures`, `req.url` retains a leading slash (e.g. `/suzuka-2026-r3/meta.json`).
- On Windows, `path.join(__dirname, 'fixtures', cleanUrl)` treated the leading slash as a drive root, stripping `__dirname`.
- Stripping leading slashes via `.replace(/^\/+/, '')` before calling `path.resolve` ensures robust cross-platform fixture serving.

## Phase 3 Findings

### Suzuka Ribbon Topology & Quad-Strip Rendering
- Suzuka's iconic figure-8 crossover track layout produces self-intersections when attempting to stroke and fill complex single-path ribbons with winding rules.
- Triangulating / quad-stripping the track ribbon segment-by-segment between corresponding index pairs of outer and inner track geometry ensures 100% stable, broadcast-quality asphalt fills without clipping or inverted hole artifacts across crossover bridges.

### Async WebGL Init vs Synchronous React Effect
- PixiJS v8 `Application.init()` is an asynchronous Promise, whereas React 19 component effects and prop change listeners execute synchronously.
- Instantiating PixiJS display objects eagerly in the class constructor and guarding the RAF render loop with `this.initialized` guarantees that synchronous state updates never attempt to render into uninitialized WebGL pipelines.

### React 19 Ref Mutability & Engine State Binding
- Mutating a ref (`clockRef.current = newClock`) inside `useEffect` without driving React state updates resulted in downstream child components permanently receiving stale `null` references (`clock={null}`).
- Storing the active `PlaybackClock` and `FrameStore` instances in `useState` guarantees proper downstream binding and canvas initialization once engine components are ready.

### Double-Firing Keyboard Shortcut Deduplication
- Global window listeners for keys (e.g. `KeyD`, `KeyL`) must be centralized in `RaceWorkspace.tsx` rather than duplicated inside child canvas renderers. Registering the same keydown listener on `window` in both parent workspace and renderer caused boolean toggles to flip twice per keypress, effectively canceling each other out.

### Playback Rate Scaled Seek Threshold
- At high playback speeds (16×–32×), the elapsed race time delta per frame exceeds 0.5s (`dt = 32 * 0.0167s = 0.533s`). Fixed `dt > 0.5s` seek thresholds falsely trigger trail buffer resets on every frame. Scaling the threshold dynamically with `playbackRate` (`Math.max(1.5, playbackRate * 0.12)`) cleanly differentiates between fast forward playback and user seek actions.

### Zero-Allocation Hot Path Optimization
- To prevent GC pauses and frame stutters at 60 fps, all hot-path rendering layers (`LabelsLayer`, `CarsLayer`, `TrackAsphaltLayer`, `FinishLineLayer`) utilize preallocated scratch arrays, vector pools, and bounding box pools rather than allocating objects or array literals each frame.

