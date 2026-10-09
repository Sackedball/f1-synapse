# Explanation: `src/gui/pit_wall_window.py`

## High-Level Overview
`src/gui/pit_wall_window.py` defines the base architectural class `PitWallWindow`, inheriting from PySide6's `QMainWindow`. It acts as the foundational template and abstraction layer for all real-time telemetry analysis windows across the application (such as driver telemetry, tyre strategy, track maps, race control feeds, and ML predictions). It encapsulates socket lifecycle management, thread-safe signal-slot wiring via `TelemetryStreamClient`, standard F1-themed QSS styling, status bar telemetry counters, and lifecycle shutdown hooks (`closeEvent`).

---

## Dependencies

### Standard Library
- No direct standard library dependencies (standard types and exceptions used directly).

### External Libraries
- `PySide6.QtWidgets`: UI presentation components (`QMainWindow`, `QStatusBar`, `QLabel`).
- `PySide6.QtCore`: Core Qt constants (`Qt`).

### Internal Modules
- `src.services.stream.TelemetryStreamClient`: Background `QThread` network client connecting via TCP to the simulation/telemetry broadcast server (`localhost:9999`) to stream JSON telemetry packets.

---

## Classes & Functions

### `STYLE_SHEET` (Module Constant)
Comprehensive F1-styled dark stylesheet shared across all pit wall analysis windows.
- Background: `#15151e` (dark asphalt/navy).
- Surface / Inputs / Tables: `#1f1f27` with `#383845` borders.
- Buttons / Accent Highlights: `#2c2c34` with vibrant F1 red hover (`#e10600`) and active press (`#c00400`).
- Tables & Headers: `#15151e` table headers with red bottom border indicators (`#e10600`).
- Tab widgets and scrollbars: Custom-styled handles, panes, and active tabs.

### `class PitWallWindow(QMainWindow)`
Abstract base window class for telemetry-driven tools.

- `__init__(self)`:
  - Applies `STYLE_SHEET` and sets default window dimensions (1000x700).
  - Initializes `message_count = 0`.
  - Instantiates `TelemetryStreamClient` as `self.client`.
  - Connects client Qt signals:
    - `self.client.data_received` -> `self._handle_data_received`
    - `self.client.connection_status` -> `self._handle_connection_status`
    - `self.client.error_occurred` -> `self._handle_error`
  - Initializes status bar indicators via `_setup_status_bar()`.
  - Calls `self.setup_ui()` (implemented by subclasses to lay out specific widgets).
  - Starts the background client thread via `self.client.start()`.
- `_setup_status_bar(self)`:
  Initializes `QStatusBar` and attaches two permanent widgets:
  1. `connection_label`: Shows "Disconnected", "Connecting...", or "Connected" with color-coded styling.
  2. `messages_label`: Tracks received packet count ("Messages: N").
- `_handle_data_received(self, data: dict)`:
  Increments message counter, updates the status bar label, and delegates processing to `self.on_telemetry_data(data)`.
- `_handle_connection_status(self, status: str)`:
  Updates `connection_label` text and visual color (Green for "Connected", Orange for "Connecting...", Red for "Disconnected"), then calls `self.on_connection_status_changed(status)`.
- `_handle_error(self, error_msg: str)`:
  Displays temporary 5-second error message in status bar and forwards error to `self.on_stream_error(error_msg)`.
- `closeEvent(self, event)`:
  Intercepts Qt window close events. Safely requests client thread stoppage (`self.client.stop()`) and waits up to 2000ms (`self.client.wait(2000)`) before releasing socket and thread resources, avoiding application hangs or orphaned background threads.
- **Hook / Abstract Methods (For Subclasses)**:
  - `setup_ui(self)`: Subclasses override to build UI components and layout before stream starts.
  - `on_telemetry_data(self, data: dict)`: Subclasses override to parse and visualize incoming frames.
  - `on_connection_status_changed(self, status: str)`: Subclasses override to handle network connect/disconnect events (e.g., enable/disable UI controls).
  - `on_stream_error(self, error_msg: str)`: Subclasses override to handle transport or JSON parse errors.

---

## Core Logic

1. **Template Method Design Pattern**:
   `PitWallWindow` establishes the skeleton of telemetry-driven windows. Subclasses only need to implement domain-specific UI (`setup_ui`) and frame handling (`on_telemetry_data`), while networking, error logging, thread synchronization, status reporting, and safe destruction are fully handled by the base class.

2. **Thread Safety via Qt Signals**:
   Network reads occur in `TelemetryStreamClient` on a background thread. Raw TCP socket data is unpacked and emitted across threads via Qt signals (`data_received`). In Qt, cross-thread signal emissions are automatically queued into the main thread's event loop, preventing race conditions or crashes when updating GUI widgets in `on_telemetry_data`.

3. **Graceful Teardown**:
   When a user closes an insight window, `closeEvent` ensures `self.client.stop()` sets the thread termination flag and shuts down the TCP socket, followed by `self.client.wait(2000)` to ensure clean thread death before the Qt widget is freed from memory.
