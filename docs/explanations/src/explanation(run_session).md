# Explanation: run_session.py

## High-Level Overview
`src/run_session.py` serves as the runtime process launcher and bridge between different presentation layers of the application. It decouples the Pyglet/Arcade 2D graphics render loop from external process lifecycles, enabling non-blocking execution of telemetry servers, the Arcade window, and concurrent PySide6 insight windows.

---

## Dependencies

### Standard Library
- `os`, `sys`: Accesses system interpreter executable (`sys.executable`) to spawn independent child processes.
- `subprocess`: Spawns asynchronous child processes (`subprocess.run`).
- `threading`: Runs background launcher worker threads (`threading.Thread`) so sleeps do not block the main process.
- `time`: Implements delays (`time.sleep`) to give TCP stream sockets time to bind before clients connect.

### External Libraries
- `arcade`: Python 2D graphics library based on Pyglet/OpenGL (`arcade.run()`).

### Internal Modules
- `src.interfaces.race_replay.F1RaceReplayWindow`: The primary 2D circuit renderer and telemetry broadcaster.
- `src.insights.telemetry_stream_viewer.main`: Diagnostic inspection tool entrypoint.

---

## Classes & Functions

### Functions

#### `run_arcade_replay(...)`
- **Purpose**: Instantiates and executes the 2D race replay window within the Arcade/OpenGL event loop.
- **Inputs**:
  - `frames` (*list[dict]*): Time-series array of interpolated car and weather telemetry frames.
  - `track_statuses` (*list[dict]*): Flags and race control track state intervals (e.g. Green, Yellow, SC, VSC, Red).
  - `example_lap` (*pd.DataFrame*): Reference single-lap telemetry for track polyline layout and DRS zones.
  - `drivers` (*list*): Driver identifiers participating in the session.
  - `title` (*str*): Window title string.
  - `playback_speed` (*float*): Initial speed factor (default: `1.0`).
  - `driver_colors` (*dict*): Team-specific RGB tuples keyed by driver code.
  - `circuit_rotation` (*float*): Track orientation adjustment in degrees.
  - `total_laps` (*int*): Official lap count of the race.
  - `visible_hud` (*bool*): Toggles HUD visibility.
  - `ready_file` (*str | None*): Path to a synchronization lockfile.
  - `session_info` (*dict | None*): Event metadata for banner rendering.
  - `session`: FastF1 session object.
  - `enable_telemetry` (*bool*): Enables background TCP socket broadcasting on port 9999.
  - `race_control_messages` (*list*): FIA race control message records.
- **Outputs**: None. Blocks inside `arcade.run()` until the user closes the window.
- **Core Logic**:
  Instantiates `F1RaceReplayWindow`, checks if a `ready_file` token was provided (writing `'ready'` to let the parent Qt selection window dismiss its loading splash), and hands execution to `arcade.run()`.

#### `launch_telemetry_viewer()`
- **Purpose**: Launches the raw diagnostic stream viewer (`src.insights.telemetry_stream_viewer`) as a detached background process.
- **Core Logic**:
  Spawns a daemon thread that sleeps for 3 seconds (allowing the Arcade TCP server to bind port 9999) before running `python -m src.insights.telemetry_stream_viewer`.

#### `launch_insights_menu()`
- **Purpose**: Launches the PySide6 Pit Wall Insights menu (`src.gui.insights_menu`) in a parallel process.
- **Core Logic**:
  Spawns a daemon thread that waits 1 second and executes `python -m src.gui.insights_menu` via `subprocess.run`, ensuring the Qt insights application runs in its own process separate from the Arcade game loop without OpenGL/Qt thread conflicts.
