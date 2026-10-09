# Explanation: `src/interfaces/race_replay.py`

## High-Level Overview
`src/interfaces/race_replay.py` is the central 2D visual simulation and race playback engine of the application. Built using Python's `arcade` library, it simulates an entire Formula 1 Grand Prix on an authentic 2D track layout, rendering car positions, driver leaderboard standings, safety cars, sector/lap times, DRS zones, track flag statuses, and real-time weather. Furthermore, it operates as the primary **Telemetry Broadcast Server** (`TelemetryStreamServer`), publishing synchronized JSON frames over TCP socket `localhost:9999` to external PySide6 Pit Wall analysis windows.

---

## Dependencies

### Standard Library
- `os`: File system operations (loading icons and background textures).
- `time`: Measuring real-world time for visual effects (e.g. pulsing Safety Car glow).

### External Libraries
- `arcade`: Hardware-accelerated OpenGL 2D graphics engine managing windows, textures (`arcade.load_texture`), shape rendering (`draw_circle_filled`, `draw_line_strip`, `draw_rect_filled`), text drawing (`arcade.Text`), and mouse/keyboard event loops.
- `pyglet`: Underlying window manager utilized by Arcade to set custom application icons.
- `numpy`: High-speed vector math, spline interpolation (`np.linspace`, `np.interp`), geometric rotations, 2D normals (`np.gradient`), and Shoelace track winding area calculation.
- `scipy.spatial.cKDTree`: Accelerated \(O(\log N)\) nearest-neighbor spatial indexing tree used to project arbitrary car \((x, y)\) coordinates onto the track centerline.
- `pandas` / `fastf1`: Used in `@staticmethod` data ingestion methods (`_compute_lap_times`) to parse official session timing feeds, lap times, tyre stints, and extended interval stream data.

### Internal Modules
- `src.f1_data.FPS`: Replay sampling rate (typically 10 Hz / 60 Hz).
- `src.ui_components`:
  - `LeaderboardComponent`: Interactive right-hand race standings table with timing gaps and tyre badges.
  - `WeatherComponent`: Top-left meteorological panel showing air/track temperatures, humidity, rainfall, and wind.
  - `LegendComponent`: Bottom-left on-screen keyboard shortcut guide.
  - `DriverInfoComponent`: Detailed telemetry and tyre degradation inspection panel for a selected driver.
  - `RaceProgressBarComponent`: Bottom scrub bar with interactive DNF, safety car, and lead change markers.
  - `RaceControlsComponent`: Interactive media controls (Play/Pause, Rewind, Fast-Forward, Playback Speed).
  - `ControlsPopupComponent`: Modal help overlay explaining keybindings.
  - `SessionInfoComponent`: Top banner displaying Grand Prix title, circuit name, round, and year.
  - `extract_race_events`: Aggregates safety cars, pit stops, and retirements for timeline markers.
  - `build_track_from_example_lap`: Derives circuit boundary coordinates and DRS detection zones.
  - `draw_finish_line`: Draws the checkered start/finish line across the circuit.
- `src.tyre_degradation_integration.TyreDegradationIntegrator`: Evaluates non-linear Bayesian and polynomial tyre degradation curves.
- `src.services.stream.TelemetryStreamServer`: Multi-client TCP socket server broadcasting real-time replay state to companion windows.

---

## Classes & Functions

### Module Constants
- `SCREEN_WIDTH` (1280), `SCREEN_HEIGHT` (720), `SCREEN_TITLE` ("F1 Race Replay").
- `PLAYBACK_SPEEDS`: Discrete playback rate ladder (`[0.1, 0.2, 0.5, 1.0, 2.0, 4.0, 8.0, 16.0, 32.0, 64.0, 128.0, 256.0]`).

### `class F1RaceReplayWindow(arcade.Window)`
The primary 2D interactive replay simulation window.

- `__init__(self, frames, track_statuses, example_lap, drivers, title, ...)`:
  - Initializes resizable Arcade window and sets custom taskbar icon.
  - Starts `TelemetryStreamServer` on `localhost:9999` if `enable_telemetry=True`.
  - Ingests simulation frames, driver lists, team livery colors, track status intervals, and race control messages.
  - Executes static pre-computation routines:
    - `_compute_lap_times(frames, session)`: Extracts authoritative lap times, gaps to leader, pit statuses, and tyre stints.
    - `_compute_status_laps(frames, track_statuses)`: Correlates safety cars and yellow flags to leader lap numbers.
  - Calculates track geometry, interpolates centerline into 4000 points, constructs `cKDTree` spatial index, and determines track winding via Shoelace formula to orient normal vectors outward.
  - Initializes UI component instances (`leaderboard_comp`, `weather_comp`, `driver_info_comp`, `progress_bar_comp`, etc.).
  - Initializes `TyreDegradationIntegrator` if session data is present.
  - Computes initial viewport scaling (`update_scaling`).
- `_compute_driver_positions(self, frame) -> tuple[dict, str, int]`:
  Calculates continuous progress in meters for every driver:
  $$\text{Progress} = (\text{Lap} - 1) \times \text{TrackLength} + \text{ProjectedDistanceOnCenterline}$$
  Sorts all drivers to assign authoritative `position` (1st, 2nd, ...), populating `pos["position"]` directly inside the frame. Returns progress dictionary, leader driver code, and current leader lap.
- `_broadcast_telemetry_state(self)`:
  Packages the active replay state into a JSON-serializable dictionary and broadcasts it to all connected TCP clients:
  - Active frame index and telemetry.
  - Live track status (Green, Yellow, SC, VSC, Red).
  - Playback speed, pause state, and circuit length.
  - Race control messages up to the current session time.
  - Periodic circuit polyline geometry (broadcast every ~2 seconds / 120 frames).
  - Pre-computed lap time table and tyre degradation statistics.
- `_project_to_reference(self, x: float, y: float) -> float`:
  Performs an \(O(\log N)\) query on `self.track_tree` to find the nearest vertex on the reference track, then projects the coordinate onto the line segment to compute exact along-track meters from the start line.
- `update_scaling(self, screen_w: int, screen_h: int)`:
  Computes transformation matrices (rotation, uniform scale, translation) ensuring the circuit fits snugly inside the viewport while preserving reserved margins for HUD overlays.
- `world_to_screen(self, x: float, y: float) -> tuple[float, float]`:
  Transforms raw GPS/metric coordinates into rotated, scaled screen coordinates.
- `on_draw(self)`:
  Primary rendering loop:
  1. Draws background texture (if present).
  2. Renders circuit inner and outer boundaries tinted by track status (Grey = Green, Yellow = Caution, Amber = VSC/SC, Red = Stoppage).
  3. Draws bright green highlighted DRS zones and start/finish line.
  4. Renders car markers (colored circles with optional leader lines and driver 3-letter codes).
  5. Renders animated Safety Car (pulsing amber halo and "SC" text) when deployed or returning.
  6. Draws HUD text (Lap number, elapsed race time, track status flags).
  7. Renders weather box, leaderboard, progress bar, media controls, and driver telemetry cards.
- `on_update(self, delta_time: float)`:
  Advances simulation clock:
  - Handles seeking/scrubbing (`is_rewinding`, `is_forwarding`).
  - Advances `self.frame_index += delta_time * FPS * self.playback_speed`.
  - Whenever the integer frame advances, calls `_broadcast_telemetry_state()` to notify pit wall windows.
- `on_key_press(self, symbol, modifiers)` / `on_key_release`:
  Keyboard controls:
  - `SPACE`: Play / Pause.
  - `LEFT` / `RIGHT`: Hold to rewind / fast-forward at 3x speed.
  - `UP` / `DOWN`: Step through playback speeds (0.1x to 256x).
  - `1`, `2`, `3`, `4`: Preset speeds (0.5x, 1x, 2x, 4x).
  - `R`: Reset replay to start and clear tyre degradation cache.
  - `D`: Toggle DRS zone highlighting.
  - `L`: Toggle driver name callout labels.
  - `H`: Toggle controls popup dialog.
  - `B`: Toggle bottom progress bar.
  - `I`: Toggle top session banner.
  - `ESC`: Close window.
- `on_mouse_press(self, x, y, button, modifiers)`:
  Routes click events to UI components (scrubbing timeline bar, clicking driver on leaderboard to inspect telemetry, pressing media control buttons).
- `close(self)`:
  Gracefully halts the `TelemetryStreamServer` background network thread upon window exit.

### Static Data Enrichment Methods
- `_compute_lap_times(frames, session=None) -> dict`:
  Deterministic processor that scans session frames or FastF1 `session.laps` and `extended_timing_data`. Reconciles official lap times, gaps to leader, sector times, tyre compounds, tyre age, pit entries, and retirements.
- `_compute_fallback_lap_times_raw(frames)`:
  Derives lap times by tracking driver lap counter increments directly across simulation frames if official FastF1 data is unavailable.
- `_classify_lap_entries(result, official_data=False)`:
  Analyzes lap time deltas against a rolling 5-lap median baseline to detect pit in-laps, out-laps, and incident outliers.
- `_compute_status_laps(frames, track_statuses) -> list`:
  Correlates track status intervals (Safety Car, VSC, Red Flag) with leader lap numbers.
- `_fill_missing_official_tyre_life(result)`:
  Iterates tyre stints to interpolate and reconstruct missing tyre age counters.
- `_estimate_official_replay_time_offset(official_result, fallback_result)`:
  Calculates session time offset between official FIA timestamps and local simulation frame clocks.
- `_attach_replay_aligned_lap_times(result, replay_time_offset_s, fallback_result)`:
  Synchronizes official lap completion timestamps with local replay timestamps.

---

## Core Logic

1. **Shoelace Formula & KD-Tree Spatial Projection**:
   Car telemetry provides \((x, y)\) coordinates in meters. To calculate leaderboard position, relative track distance, and outward-facing callout labels:
   - The centerline is converted into a `cKDTree` for sub-millisecond closest-point queries.
   - The track's polygon winding order is determined using the Shoelace formula:
     $$\text{Area} = \frac{1}{2} \sum (x_i y_{i+1} - x_{i+1} y_i)$$
     If area is positive (counter-clockwise), normal vectors are flipped so that callout lines always project away from the circuit interior.

2. **Authoritative Monotonic Progress Ordering**:
   Instead of relying on intermittent timing transponder beams, `_compute_driver_positions` evaluates:
   $$\text{Progress} = (\text{Lap} - 1) \times \text{LapDistance} + \text{ProjectedDistance}$$
   This guarantees that car order on the leaderboard updates smoothly at 60 FPS and precisely reflects physical overtaking maneuvers on track.

3. **Decoupled Telemetry Broadcast (Publisher-Subscriber)**:
   The Arcade replay loop does not directly interact with PySide6 widgets. Instead, it acts as a headless TCP telemetry server. Any number of secondary analytical tools (driver inputs, tyre degradation charts, live track radars) connect to `localhost:9999` and receive uniform telemetry states without impacting simulation frame rates.
