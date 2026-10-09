# Explanation: `src/insights/example_pit_wall_window.py`

## High-Level Overview
`src/insights/example_pit_wall_window.py` is a reference implementation and functional proof-of-concept demonstrating how to extend `PitWallWindow`. It connects to the live telemetry stream over TCP `localhost:9999`, parses incoming replay frames, and displays session state (frame index, track flags, playback speed, and active driver count) alongside a monospace text log showing each driver's lap number, current velocity, and along-track distance.

---

## Dependencies

### Standard Library
- `sys`: Provides access to command-line parameters (`sys.argv`) and clean application shutdown (`sys.exit`).

### External Libraries
- `PySide6.QtWidgets`: UI presentation elements (`QApplication`, `QWidget`, `QVBoxLayout`, `QLabel`, `QTextEdit`, `QGroupBox`).
- `PySide6.QtGui.QFont`: Configures fonts for data labels and monospace text formatting.

### Internal Modules
- `src.gui.pit_wall_window.PitWallWindow`: Base window class managing TCP connection to telemetry streams, status bars, and dark theme styles.

---

## Classes & Functions

### `class ExamplePitWallWindow(PitWallWindow)`
Custom desktop window displaying live session and driver telemetry summary.

- `__init__(self)`:
  Initializes base window properties, starts the telemetry client socket, and sets window title to `"F1 Race Replay - Example Pit Wall"`.
- `setup_ui(self)`:
  Builds the visual widget hierarchy:
  - **Session Information Group (`QGroupBox`)**:
    - `frame_label`: Shows `"Frame: X / Total"`.
    - `drivers_label`: Shows count of active drivers on circuit.
    - `track_status_label`: Shows track flag state (e.g. Green, Yellow, SC).
    - `playback_label`: Displays playback status (`PLAYING` or `PAUSED`) and multiplier rate.
  - **Driver Details Group (`QGroupBox`)**:
    - `drivers_text`: Read-only, monospace (`Courier`) `QTextEdit` displaying sorted per-driver metrics.
- `on_telemetry_data(self, data: dict)`:
  Triggered upon packet arrival from `TelemetryStreamClient`:
  - Formats and updates `frame_label`, `track_status_label`, and `playback_label`.
  - Loops over `data['frame']['drivers']`, formatting lines with driver code, current lap, speed (km/h), and track distance (m).
  - Joins lines and updates `drivers_text`.
- `on_connection_status_changed(self, status: str)`:
  Updates `frame_label` with `"Waiting for data..."` when connected or `"Disconnected"` when connection drops.
- `on_stream_error(self, error_msg: str)`:
  Hook for handling network or JSON decode errors (status bar notification is handled automatically by base class).

### Global Functions
- `main()`:
  Initializes `QApplication`, instantiates `ExamplePitWallWindow`, displays it on screen, and starts the Qt event loop (`app.exec()`).

---

## Core Logic

1. **Subclassing the Base Framework**:
   This module demonstrates the intended design pattern for all insight tools: rather than manually managing TCP sockets, background threads, and Qt synchronization, the window inherits from `PitWallWindow`, allowing it to focus exclusively on widget construction and telemetry rendering.

2. **Monospace Tabular Text Layout**:
   Instead of instantiating dozens of complex table cell items at 60 FPS, this example formats driver metrics into formatted plain text strings displayed inside a read-only `QTextEdit`. This minimizes GUI overhead while ensuring clear, fixed-width column alignment across all driver entries.
