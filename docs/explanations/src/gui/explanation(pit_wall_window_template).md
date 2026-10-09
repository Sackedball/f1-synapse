# Explanation: `src/gui/pit_wall_window_template.py`

## High-Level Overview
`src/gui/pit_wall_window_template.py` is a developer boilerplate and reference starter file designed to accelerate the creation of new telemetry visualization windows. By inheriting from `PitWallWindow`, it provides an empty shell with guided `TODO` comments indicating where developers should create UI widgets (`setup_ui`), unpack live frame dictionaries (`on_telemetry_data`), react to socket connection changes (`on_connection_status_changed`), and handle network stream errors (`on_stream_error`).

---

## Dependencies

### Standard Library
- `sys`: Provides access to command-line parameters (`sys.argv`) and process exit handling (`sys.exit`).

### External Libraries
- `PySide6.QtWidgets.QApplication`: The core GUI application object managing the event loop for desktop execution.

### Internal Modules
- `src.gui.pit_wall_window.PitWallWindow`: Base window class managing TCP connection to telemetry streams, dark theme styles, and lifecycle hooks.

---

## Classes & Functions

### `class MyCustomWindow(PitWallWindow)`
A minimal starter implementation subclassing `PitWallWindow`.

- `__init__(self)`:
  Calls `super().__init__()` to trigger background TCP streaming, default dimensions, and theme initialization. Configures window title to `"F1 Race Replay - My Custom Window"`.
- `setup_ui(self)`:
  Lifecycle stub called during base class initialization. Intended for instantiating layouts (`QVBoxLayout`, `QGridLayout`), labels, tables, or charts and parenting them to the central widget.
- `on_telemetry_data(self, data: dict)`:
  Callback executed on every new telemetry packet received over the socket. Contains documented keys:
  - `frame_index`: Integer index of current playback frame.
  - `total_frames`: Total frame count in the replay session.
  - `frame`: Dictionary containing timestamp `t` and driver telemetry states `drivers`.
  - `track_status`: Track flag/condition string (e.g. green, yellow, safety car).
  - `playback_speed`: Playback multiplier.
  - `is_paused`: Boolean state of replay playback.
- `on_connection_status_changed(self, status: str)`:
  Callback triggered whenever the socket connection state changes ("Connected", "Connecting...", "Disconnected").
- `on_stream_error(self, error_msg: str)`:
  Callback triggered upon socket errors or JSON decoding failures.

### Global Functions
- `main()`:
  Standard standalone launcher function that instantiates `QApplication`, creates and displays `MyCustomWindow`, and starts the Qt event loop (`app.exec()`).

---

## Core Logic

1. **Boilerplate Architecture**:
   This module exemplifies rapid application development (RAD) patterns for GUI telemetry clients. By encapsulating socket connection management, background threading, Qt signal/slot synchronization, and F1 styling inside `PitWallWindow`, third-party or new insight windows only need ~30 lines of declarative logic to create custom dashboards.

2. **Standalone Executability**:
   The included `if __name__ == "__main__": main()` block allows developers to test their newly created window independently in isolation, without having to launch the entire Arcade 2D race replay or main navigation menus.
