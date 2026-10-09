# Explanation: `src/gui/insights_menu.py`

## High-Level Overview
`src/gui/insights_menu.py` serves as the centralized launcher launcher and hub for all F1 race analysis, telemetry diagnostics, and telemetry-driven "Pit Wall" windows. Implemented as a dark-themed PySide6 (Qt) desktop window, it categorizes and presents buttons that instantiate dedicated secondary windows (such as live driver telemetry, tyre strategy charts, circuit position maps, race control event feeds, lap time/gap evolution curves, and real-time machine learning predictions). It also manages open window references to avoid premature garbage collection by Python's runtime.

---

## Dependencies

### Standard Library
- `sys`: Accesses system command-line arguments (`sys.argv`), executable interpreter paths (`sys.executable`), and application exit hooks (`sys.exit`).
- `subprocess`: Spawns standalone external Python processes (such as `src.insights.telemetry_stream_viewer`).
- `importlib`: Dynamically reloads specific modules (e.g., `src.insights.tyre_strategy_window`) during runtime.

### External Libraries
- `PySide6.QtWidgets`: Provides GUI elements including `QApplication`, `QMainWindow`, `QWidget`, `QVBoxLayout`, `QHBoxLayout`, `QPushButton`, `QLabel`, `QFrame`, `QScrollArea`, and `QMessageBox`.
- `PySide6.QtCore`: Contains core Qt enums, specifically `Qt.PointingHandCursor` for hover interactivity.
- `PySide6.QtGui`: Font styling (`QFont`) and window/taskbar iconography (`QIcon`).

### Internal Modules
- `src.insights.example_pit_wall_window.ExamplePitWallWindow`: Reference sample window demonstrating telemetry consumption.
- `src.insights.driver_telemetry_window.DriverTelemetryWindow`: Real-time driver inputs (throttle, brake, RPM, gear, speed).
- `src.insights.track_position_window.TrackPositionWindow`: Live 2D circuit position map.
- `src.insights.race_control_feed_window.RaceControlFeedWindow`: Event logger for flags, penalties, and safety car interventions.
- `src.insights.lap_time_chart_window.LapTimeChartWindow`: Interactive PyQtGraph curves of lap times and gaps.
- `src.insights.tyre_strategy_window.TyreStrategyWindow`: Live tyre compound stints and pit stop timelines.
- `src.insights.ml_prediction_window.MLPredictionWindow`: Real-time overtake and pit stop probability inference engine.

---

## Classes & Functions

### `STYLE_SHEET` (Module Constant)
A comprehensive QSS (Qt Style Sheet) string defining a cohesive F1-themed dark aesthetic:
- Background: `#15151e` (Formula 1 dark charcoal/navy).
- Typography: Titillium Web / Roboto sans-serif fonts.
- Buttons: `#2c2c34` with an F1 racing red (`#e10600`) accent border on the left edge, shifting to `#f5201b` on hover.
- Custom slim scrollbars with styled thumb tracks.

### `class InsightsMenu(QMainWindow)`
Main launcher window class managing category layouts and window lifecycles.

- `__init__(self)`:
  Initializes the window with geometry (300x600), creates an internal `opened_windows` list to hold strong references to spawned PyQt windows, builds the UI, and attaches `STYLE_SHEET`.
- `setup_ui(self)`:
  Constructs the window's vertical layout:
  - Header: Application title and subtitle.
  - Scroll Area: Scrollable widget containing vertically stacked category sections.
  - Category sections: "Live Telemetry", "Machine Learning", "Track", "Race Events", "Race Analysis", and "Example Insights".
  - Footer: Telemetry requirement notice and close button.
- `create_header(self) -> QFrame`:
  Builds the header banner with bold F1 styling and descriptive text.
- `create_footer(self) -> QFrame`:
  Builds the bottom toolbar with an informational note and a red "Close Menu" button (`#close_btn`).
- `create_category_section(self, category_name: str, insights: list) -> QFrame`:
  Constructs a stylized group box containing an uppercase category title, a horizontal divider line, and individual action buttons.
- `create_insight_button(self, name: str, description: str, callback: callable) -> QPushButton`:
  Generates a custom card-like button displaying an insight's title in bold and a summary description beneath it, hooked to a click trigger.
- **Launcher Callbacks**:
  - `launch_example_window(self)`: Instantiates and displays `ExamplePitWallWindow`.
  - `launch_driver_telemetry(self)`: Spawns `DriverTelemetryWindow`.
  - `launch_track_position(self)`: Spawns `TrackPositionWindow`.
  - `launch_race_control_feed(self)`: Spawns `RaceControlFeedWindow`.
  - `launch_lap_time_chart(self)`: Spawns `LapTimeChartWindow`.
  - `launch_telemetry_viewer(self)`: Uses `subprocess.Popen` to launch `src.insights.telemetry_stream_viewer` as an independent OS process.
  - `launch_tyre_strategy(self)`: Dynamically reloads `src.insights.tyre_strategy_window` and displays `TyreStrategyWindow`.
  - `launch_ml_predictions(self)`: Spawns `MLPredictionWindow`.
  - `launch_speed_monitor(self)`, `launch_position_tracker(self)`, `launch_pit_analysis(self)`, `launch_gap_analysis(self)`, `launch_sector_times(self)`, `launch_lap_evolution(self)`, `launch_top_speed(self)`, `launch_flag_tracker(self)`, `launch_overtake_counter(self)`, `launch_drs_usage(self)`: Placeholder stubs routing to `show_placeholder_message`.
- `show_placeholder_message(self, insight_name: str)`:
  Displays a `QMessageBox` modal indicating that the requested tool is under active development or serves as an extension point.

### Global Functions
- `launch_insights_menu() -> InsightsMenu`:
  Factory function used by external callers (such as the main Arcade race replay window). Detects or instantiates an active `QApplication` instance, creates the `InsightsMenu`, displays it, and returns the reference.
- `main()`:
  Standalone entry point initializing a standalone `QApplication`, configuring the application icon and window title, and running the Qt event loop (`app.exec()`).

---

## Core Logic

1. **Python Garbage Collection Safeguard (`self.opened_windows`)**:
   In Qt / PySide6, if a `QMainWindow` or `QWidget` is created inside a local function without being assigned to an attribute of an existing persistent object or parented to an existing widget, Python's garbage collector immediately destroys it as soon as the method execution completes. `InsightsMenu` maintains `self.opened_windows.append(window)` so all launched tools stay open in memory and on-screen until closed by the user.

2. **Lazy Dynamic Imports**:
   Insight window classes are imported lazily inside their respective `launch_*` handler methods rather than at the top of the file. This speeds up the launch time of the menu itself, avoids circular imports, and allows individual tools to fail gracefully or reload on demand without crashing the entire launcher interface.

3. **Inter-Process Decoupling**:
   While most visual tools run in the same Qt thread context, raw diagnostic tools like `telemetry_stream_viewer` are spawned via `subprocess.Popen([sys.executable, "-m", ...])` to isolate heavy terminal/console logging or curses-style rendering into an independent process.
