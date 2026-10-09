# Explanation: `src/interfaces/qualifying.py`

## High-Level Overview
`src/interfaces/qualifying.py` implements the interactive 2D graphical replay and comparative telemetry interface for Formula 1 Qualifying sessions (Q1, Q2, and Q3). Built on top of the Python `arcade` game engine, it features an interactive qualifying session leaderboard, a qualifying segment selector modal, multi-trace synchronized telemetry graphs (Speed, Gear, and Throttle/Brake vs. Track Distance), DRS zone highlighting, a real-time circuit position marker, and a comparison overlay matching the selected driver against the pole-sitter / fastest lap in Q3.

---

## Dependencies

### Standard Library
- `threading`: Spawns background worker threads (`threading.Thread`) to download telemetry asynchronously via FastF1 without freezing UI rendering.
- `time`: Playback pacing, sleep delays, and benchmark tracking.
- `os`: Validates paths for application window icons (`images/formula-1-logo-png.png`).

### External Libraries
- `arcade`: Powers 2D hardware-accelerated OpenGL windowing, canvas drawing primitives (`draw_line_strip`, `draw_rect_filled`, `draw_circle_filled`), text rendering (`arcade.Text`), mouse/keyboard event loops, and window lifecycle.
- `pyglet`: Underlying window manager utilized by Arcade to set custom application icons.
- `numpy`: High-performance vector operations, geometric rotations (`cos`, `sin`, `deg2rad`), 1D spline/linear interpolation (`np.interp`, `np.linspace`), cumulative track distance calculation (`np.cumsum`), and binary search timestamps (`np.searchsorted`).

### Internal Modules
- `src.ui_components`:
  - `build_track_from_example_lap`: Generates outer, inner, and centerline reference coordinates for the circuit layout.
  - `LapTimeLeaderboardComponent`: Left-hand qualifying results table showing driver classifications, times, intervals, and compound badges.
  - `QualifyingSegmentSelectorComponent`: Pop-up dialog allowing the user to pick Q1, Q2, or Q3 telemetry laps for a driver.
  - `RaceControlsComponent`: Interactive playback toolbar (Play/Pause, Rewind, Fast-Forward, Playback Speed).
  - `draw_finish_line`: Draws the circuit start/finish checkerboard line.
  - `LegendComponent`: Bottom-left on-screen keyboard shortcut guide.
  - `ControlsPopupComponent`: Toggleable help overlay detailing interactive keys.
  - `QualifyingLapTimeComponent`: Dynamic digital sector time and delta comparison banner.
- `src.f1_data`:
  - `get_driver_quali_telemetry`: Fetches and samples telemetry frames for a specific driver and qualifying session.
  - `FPS`: Default frame rate constant (typically 10 or 60 Hz).
- `src.lib.time.format_time`: Formats millisecond/second floats into standard F1 timing strings (`m:ss.fff`).

---

## Classes & Functions

### Module Constants
- `SCREEN_WIDTH` (1280), `SCREEN_HEIGHT` (720), `SCREEN_TITLE` ("F1 Qualifying Telemetry").
- Layout Margins: `H_ROW` (38), `HEADER_H` (56), `LEFT_MARGIN` (40), `RIGHT_MARGIN` (40), `TOP_MARGIN` (40), `BOTTOM_MARGIN` (40).

### `class QualifyingReplay(arcade.Window)`
Primary 2D rendering window for qualifying telemetry and replay visualization.

- `__init__(self, session, data, circuit_rotation=0, left_ui_margin=340, right_ui_margin=0, title="Qualifying Results")`:
  - Configures window dimensions, taskbar icon, and maximizes window.
  - Stores FastF1 session object and pre-processed session results dictionary.
  - Instantiates UI components: `LapTimeLeaderboardComponent`, `RaceControlsComponent`, `QualifyingLapTimeComponent`, `QualifyingSegmentSelectorComponent`, `LegendComponent`, and `ControlsPopupComponent`.
  - Builds track geometric polylines using `build_track_from_example_lap(example_lap.get_telemetry())`.
  - Interpolates reference inner/outer polylines using NumPy into 4000 dense points and calculates cumulative distances along the reference track centerline (`_ref_cumdist`).
  - Calculates circuit rotation matrices (`_cos_rot`, `_sin_rot`).
  - Invokes `update_scaling(self.width, self.height)`.
- `update_scaling(self, screen_w: int, screen_h: int)`:
  Recalculates world-to-screen scale factors (`self.world_scale`) and offsets (`tx`, `ty`) to ensure circuit and charts fit cleanly into available viewport space while reserving margins for side UI panels.
- `world_to_screen(self, x: float, y: float) -> tuple[float, float]`:
  Applies 2D rotation about the circuit center, then applies scaling and translation to transform world telemetry coordinates (meters) to screen pixel coordinates.
- `_interpolate_points(self, xs, ys, interp_points=2000) -> list[tuple[float, float]]`:
  Resamples polyline vertices uniformly along an index domain using `np.interp`.
- `_pick_telemetry_value(self, tel: dict, *keys)`:
  Safely extracts telemetry keys (e.g. `speed`, `throttle`, `brake`, `gear`, `rel_dist`) preserving valid `0.0` values while ignoring `None`.
- `on_draw(self)`:
  Main rendering pipeline executed every frame:
  1. Clears screen to dark background `(21, 21, 30)`.
  2. If telemetry is loaded and chart is active:
     - Splits right-hand viewport into:
       - Top 50%: Telemetry curves divided into 3 stacked sub-charts: Speed (top 50%), Gears (next 25%), and Throttle/Brake (bottom 25%).
       - Bottom 50%: Minimap rendering inner and outer circuit boundaries, start/finish line, DRS zones, comparison ghost car marker (Yellow), and current driver position marker.
     - Shuts DRS activation regions with semi-transparent green rectangles on the speed graph.
     - Draws comparison driver telemetry traces (Yellow) vs. current driver traces (White speed, Gray gear, Green throttle, Red brake).
     - Draws sector time status using `QualifyingLapTimeComponent`.
  3. If no telemetry is loaded:
     - Displays prompt: *"Click a driver on the left to load their qualifying lap telemetry."*
  4. Draws `leaderboard`, `qualifying_segment_selector_modal`, `legend_comp`, `race_controls_comp`, and `controls_popup_comp`.
- `on_update(self, delta_time: float)`:
  Updates playback clock:
  - Supports continuous seeking (`is_rewinding`, `is_forwarding`) scaled by playback speed.
  - Normal playback increments `play_time += delta_time * playback_speed`.
  - Determines current `frame_index` via fast binary search: `np.searchsorted(self._times, clamped_time)`.
  - Automatically pauses when the lap reaches the final frame (`frame_index >= n_frames - 1`).
- `on_mouse_press(self, x, y, button, modifiers)`:
  Dispatches mouse click events hierarchically: modal dialog -> controls popup -> legend -> leaderboard driver click -> race control buttons.
- `on_mouse_motion(self, x, y, dx, dy)`:
  Updates button hover states in `race_controls_comp`.
- `on_mouse_release(self, x, y, button, modifiers)`:
  Ends drag/hold rewind or fast-forward states.
- `on_key_press(self, symbol, modifiers)`:
  Keyboard shortcut dispatcher:
  - `ESC`: Close window.
  - `SPACE`: Toggle play/pause.
  - `R`: Reset lap playback to start.
  - `C`: Toggle yellow comparison driver telemetry curve.
  - `D`: Toggle DRS zone visualization on circuit map.
  - `H`: Toggle help controls popup.
  - `LEFT` / `RIGHT`: Hold to rewind / fast-forward.
  - `UP` / `DOWN`: Double / halve playback speed.
  - `1`, `2`, `3`, `4`: Preset speed multipliers (0.5x, 1x, 2x, 4x).
- `on_key_release(self, symbol, modifiers)`:
  Releases fast-forward/rewind hold flags.
- `load_driver_telemetry(self, driver_code: str, segment_name: str)`:
  Checks if telemetry is pre-cached in `self.data["telemetry"]`. If present, immediately populates telemetry arrays; otherwise, spawns a background thread running `_bg_load_telemetry`.
- `_bg_load_telemetry(self, driver_code: str, segment_name: str)`:
  Worker thread executing `get_driver_quali_telemetry`. Converts data into NumPy arrays (`_times`, `_xs`, `_ys`, `_speeds`), determines speed scale bounds, resets playback state to frame 0, and activates charts.
- `is_lap_complete(self) -> bool`:
  Returns `True` if playback has reached the final frame of the lap.

### Global Functions
- `run_qualifying_replay(session, data, title="Qualifying Results", ready_file=None)`:
  Constructs `QualifyingReplay`, writes `'ready'` into `ready_file` (if IPC handshake is requested by CLI/GUI launchers), and starts the Arcade event loop with `arcade.run()`.

---

## Core Logic

1. **Distance-Based Telemetry Domain**:
   Unlike race replay which plays across wall-clock race time, qualifying telemetry is plotted along the **Track Relative Distance** (`rel_dist` or `dist`). This normalizes comparisons between two laps: a faster car and a slower car can be directly overlaid point-for-point along the track to observe apex speeds, braking points, and throttle application differences.

2. **Binary Search Timestamp Interpolation (`np.searchsorted`)**:
   Because telemetry data points may have slight jitter in time sampling, indexing frames via integer ticks can drift. The engine instead tracks continuous floating-point simulation time `play_time` and uses `np.searchsorted(self._times, clamped_time)` to locate the exact bounding frame index in \(O(\log N)\) time per redraw.

3. **Asynchronous Telemetry Ingestion**:
   FastF1 telemetry downloads can take several seconds. By initiating `_bg_load_telemetry` on a daemon thread, the window continues rendering at smooth 60 FPS with an animated loading status rather than locking the user's OS interface.
