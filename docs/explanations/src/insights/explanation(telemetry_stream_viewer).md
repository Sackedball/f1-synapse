# Explanation: `src/insights/telemetry_stream_viewer.py`

## High-Level Overview
`src/insights/telemetry_stream_viewer.py` is a debugging, diagnostic, and inspection GUI tool designed to observe the raw and parsed network traffic emitted by the race replay simulation. Connecting directly to `localhost:9999` via `TelemetryStreamClient`, it renders a split-screen desktop interface: the left panel streams pretty-printed raw JSON packets with millisecond timestamps and auto-scrolling, while the right panel categorizes the data into tabbed analytical views (**Summary**, **Drivers**, and **Events**).

---

## Dependencies

### Standard Library
- `sys`: Command-line arguments (`sys.argv`) and process termination (`sys.exit`).
- `json`: Pretty-printing raw JSON network payloads (`json.dumps(data, indent=2)`).
- `datetime`: High-resolution wall-clock logging timestamps (`datetime.now()`).

### External Libraries
- `PySide6.QtWidgets`: UI presentation widgets (`QApplication`, `QMainWindow`, `QVBoxLayout`, `QWidget`, `QTextEdit`, `QLabel`, `QStatusBar`, `QSplitter`, `QListWidget`, `QTabWidget`).
- `PySide6.QtCore`: Core constants (`Qt.Horizontal`).
- `PySide6.QtGui`: Font settings (`QFont`) and text cursor manipulation (`QTextCursor`).

### Internal Modules
- `src.services.stream.TelemetryStreamClient`: Background `QThread` socket worker handling TCP connectivity to `localhost:9999` and Qt signal dispatching.

---

## Classes & Functions

### `STYLE_SHEET` (Module Constant)
Comprehensive dark QSS style sheet conforming to the F1 visual design language (`#15151e` background, `#383845` borders, red button accents, custom scrollbars).

### `class TelemetryStreamViewer(QMainWindow)`
Main diagnostic monitor window.

- `__init__(self)`:
  Initializes window dimensions (1200x800), applies styling, and creates `TelemetryStreamClient`. Hooks signals (`data_received`, `connection_status`, `error_occurred`), builds the UI and status bar, and starts the network client thread.
- `setup_ui(self)`:
  Constructs a horizontal `QSplitter` dividing the window into two equal 600px columns:
  - **Left Panel**: Monospace `QTextEdit` (`raw_log`) displaying raw JSON dumps.
  - **Right Panel**: `QTabWidget` hosting the **Summary**, **Drivers**, and **Events** tabs.
- `setup_summary_tab(self)`:
  Builds session overview widgets:
  - `summary_text`: Read-only text box summarizing packet counts, frame numbers, unique driver counts, playback state, and track status.
  - `recent_messages`: `QListWidget` tracking a FIFO ring buffer of the 20 most recent one-line packet summaries.
- `setup_drivers_tab(self)`:
  Constructs `drivers_text` (`QTextEdit`) displaying sorted driver coordinates \((x, y)\), speeds (km/h), current lap, and track distance (m).
- `setup_events_tab(self)`:
  Builds `events_list` (`QListWidget`) tracking track flag transitions and safety car events up to 100 entries.
- `setup_status_bar(self)`:
  Creates permanent status indicators: `connection_label`, `messages_label`, and `frame_label`.
- `on_data_received(self, data: dict)`:
  Primary packet handler:
  - Formats data with `json.dumps(data, indent=2)` and appends to `raw_log`.
  - Automatically scrolls the raw log to the bottom via `QTextCursor.End`.
  - Calls `update_summary`, `update_drivers_view`, and `update_events_view`.
  - Updates status bar message counters and frame index.
- `update_summary(self, data: dict)`:
  Prepends a one-line summary to `recent_messages` (maintaining max 20 entries) and updates `summary_text`.
- `update_drivers_view(self, data: dict)`:
  Iterates over `data['frame']['drivers']`, tracks unique driver codes in `self.drivers_seen`, formats individual driver telemetry lines, and updates `drivers_text`.
- `update_events_view(self, data: dict)`:
  Detects changes in `track_status` and prepends timestamped event entries to `events_list`.
- `on_connection_status(self, status: str)`:
  Updates `connection_label` with green ("Connected"), orange ("Connecting..."), or red ("Disconnected") text.
- `on_error(self, error_msg: str)`:
  Appends error timestamp to `raw_log` and posts a 5-second transient message to the status bar.
- `closeEvent(self, event)`:
  Halts `TelemetryStreamClient` safely, waiting up to 2 seconds for clean socket shutdown before exiting.

### Global Functions
- `main()`:
  Initializes `QApplication`, displays `TelemetryStreamViewer`, and runs `app.exec()`.

---

## Core Logic

1. **Independent Process Debugging**:
   Unlike embedded analytical widgets that assume clean data structures, `TelemetryStreamViewer` is built as an independent process launched directly from terminal or via `subprocess.Popen` in `insights_menu.py`. This ensures developers can inspect network payloads even if graphical charting windows encounter exceptions.

2. **Ring Buffer Pruning**:
   At 60 FPS, appending unconstrained text to GUI widgets causes memory exhaustion within minutes. `TelemetryStreamViewer` restricts `recent_messages` to 20 entries, `events_list` to 100 entries, and periodically truncates log structures to maintain bounded memory usage.
