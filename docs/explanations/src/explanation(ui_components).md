# Explanation: ui_components.py

## High-Level Overview
`src/ui_components.py` is the central user interface and HUD (Heads-Up Display) module for the 2D Arcade replay viewer. It defines the visual component architecture, interactive click zones, layout responsiveness, and track geometry construction (track boundaries, kerbs, DRS zones, and finish line).

Every visual element rendered on top of the 2D circuit—including the live leaderboard, driver telemetry card, weather panel, playback buttons, timeline progress bar, and help modals—is encapsulated as a subclass of `BaseComponent`.

---

## Dependencies

### Standard Library
- `os`: File path operations and loading control icon textures (`images/controls/`).
- `typing`: Type definitions (`Sequence`, `Literal`, `Tuple`, `Optional`, `List`).

### External Libraries
- `arcade`: Core 2D graphics framework used for rendering shapes (`draw_lrbt_rectangle_filled`), textured quads, text labels, and UI click events.
- `numpy`: Vectorized math for calculating track normal vectors, inner/outer boundary offsets, KD-Tree lookups, and angle rotations.
- `pandas`: Telemetry series processing for reference laps.

### Internal Modules
- `src.lib.time.format_time`: Lap time and session clock string formatting.
- `src.tyre_degradation_integration`: Renders Bayesian tyre health bars (`format_tyre_health_bar`) and degradation text.

---

## Classes & UI Components

### Base Component
- **`BaseComponent`**: Base interface establishing lifecycle hooks:
  - `on_resize(window)`: Responds to window resizing and repositions anchors.
  - `draw(window)`: Executes OpenGL draw commands.
  - `on_mouse_press(window, x, y, button, modifiers) -> bool`: Handles mouse interactions and returns `True` if consumed.

### Overlay & HUD Components

1. **`LeaderboardComponent(BaseComponent)`**
   - Renders the interactive vertical live race leaderboard.
   - Displays position badges (P1 Gold, P2–P3 Red, rest dark), driver abbreviations, team colors, tyre compound badges, and tyre age.
   - Features interactive toggles for Interval gaps (`I`) vs. Leader gaps (`L`).
   - Allows users to click on any driver to select them, automatically snapping the camera and updating the telemetry HUD.
   - Displays pit indicators (`PIT`) and retirement status (`OUT`).

2. **`LapTimeLeaderboardComponent(BaseComponent)`** & **`QualifyingSegmentSelectorComponent(BaseComponent)`**
   - Specialized leaderboards for Qualifying replays, sorting cars by fastest lap times and displaying Q1/Q2/Q3 segment times and elimination cut-offs.

3. **`DriverInfoComponent(BaseComponent)`**
   - Telemetry card for the focused driver.
   - Shows live Speed (km/h), Gear indicator, Throttle/Brake bar meters, DRS activation status, and Bayesian tyre degradation health bars.

4. **`WeatherComponent(BaseComponent)`**
   - Top-right card displaying environmental conditions: track temperature, air temperature, relative humidity, wind speed, wind compass direction (`_format_wind_direction`), and rainfall flag.

5. **`SessionInfoComponent(BaseComponent)`**
   - Top banner displaying official Grand Prix event name, circuit location, country, championship round, date, and lap counter.

6. **`RaceProgressBarComponent(BaseComponent)`**
   - Bottom horizontal race timeline visualizing overall progress from Lap 1 to final lap.

7. **`RaceControlsComponent(BaseComponent)`**
   - Interactive on-screen playback controller containing buttons for Rewind, Play/Pause, Speed Down, and Speed Up.

8. **`ControlsPopupComponent(BaseComponent)` & `LegendComponent(BaseComponent)`**
   - Modal keyboard shortcut and mouse control reference guide (Space = Pause, R = Rewind, Arrow keys = Speed, scroll = zoom, click-drag = pan).

---

## Core Geometric & Track Functions

#### `_format_wind_direction(degrees: Optional[float]) -> str`
- Converts wind angle (0°–360°) into a 16-point compass string (`N`, `NE`, `ENE`, `E`, etc.).

#### `build_track_from_example_lap(example_lap, circuit_rotation=0.0) -> dict`
- **Purpose**: Constructs 2D circuit geometry from raw GPS telemetry.
- **Core Logic**:
  1. Extracts `X` and `Y` coordinates from the fastest reference lap.
  2. Applies circuit rotation around center of mass using 2D rotation matrix:
     \[
     \begin{bmatrix} x' \\ y' \end{bmatrix} = \begin{bmatrix} \cos\theta & -\sin\theta \\ \sin\theta & \cos\theta \end{bmatrix} \begin{bmatrix} x \\ y \end{bmatrix}
     \]
  3. Interpolates the track into a dense polyline of 4,000 equidistant points.
  4. Calculates orthogonal normal vectors \((-dy, dx)\) at each point.
  5. Offsets normals by half-track width to generate inner and outer track boundary lines.

#### `plotDRSzones(window, example_lap)`
- Parses `DRS` sensor flags (values 10, 12, 14) from the qualifying telemetry and draws highlighted green segments along legal DRS straightaways.

#### `draw_finish_line(window, example_lap)`
- Renders the checkered start/finish line perpendicular to the track trajectory at \(t = 0\).

#### `extract_race_events(frames)`
- Scans telemetry frames to detect pit lane entry events, overtakes, and retirements.
