# Explanation: `src/insights/race_control_feed_window.py`

## High-Level Overview
`src/insights/race_control_feed_window.py` implements the Race Control Feed insight window. Subclassing `PitWallWindow`, it connects to the live telemetry stream and presents an auto-scrolling log of official FIA Race Control messages (flags, safety car deployments, track limits penalties, DRS status, and steward investigations). Messages are synchronized with replay simulation time, highlighted with category- and flag-specific color accent bars, and de-duplicated using composite hash keys.

---

## Dependencies

### Standard Library
- `sys`: Accesses system execution parameters (`sys.argv`) and handles process exit (`sys.exit`).
- `math`: Validates numerical sectors (`math.isnan`).

### External Libraries
- `PySide6.QtWidgets`: UI presentation components (`QApplication`, `QWidget`, `QVBoxLayout`, `QLabel`, `QTextBrowser`).
- `PySide6.QtCore`: Core alignment flags (`Qt.AlignCenter`, `Qt.ScrollBarAsNeeded`, `Qt.ScrollBarAlwaysOff`).
- `PySide6.QtGui`: Font styling (`QFont`) and color manipulation (`QColor`).

### Internal Modules
- `src.gui.pit_wall_window.PitWallWindow`: Base window architecture managing TCP telemetry connections, status bars, and UI cleanup.

---

## Classes & Functions

### Module Constants & Color Mappings
- Palette: `_BG` (`#15151e`), `_BG_DARKER` (`#1f1f27`), `_BORDER` (`#383845`), `_TEXT_PRIMARY` (`#E0E0E0`), `_TEXT_DIMMED` (`#888888`), `_TEXT_TIME` (`#999999`).
- Category Accent Colors (`_CAT_COLOURS`):
  - `"Flag"`: Amber/gold (`#FFD700`)
  - `"SafetyCar"`: Orange (`#FF8C00`)
  - `"Drs"`: Cyan (`#00CED1`)
  - `"CarEvent"`: Light grey (`#B0B0B0`)
  - `"Other"`: Subtle grey (`#666666`)
- Specific Flag Overrides (`_FLAG_COLOURS`): Red (`#E74C3C`), Green/Clear (`#2ECC71`), Blue (`#3498DB`), Black & White (`#B0B0B0`), Chequered (`#F0F0F0`).
- Status Text: `_WAITING_TEXT` ("Waiting for race control messages..."), `_NO_DATA_TEXT` ("No race control data in cache...").

### Helper Functions
- `_format_time(seconds: float) -> str`:
  Converts floating seconds into standard digital clock notation `HH:MM:SS`.
- `_accent_for_event(event: dict) -> str`:
  Selects hex color code based on specific flag names (`RED`, `YELLOW`, `GREEN`) or general message categories (`SafetyCar`, `Drs`, `Flag`).
- `_clean_sector(val) -> str`:
  Safely sanitizes track sector identifiers, stripping NaN or invalid float strings to return an integer string (e.g. `"1"`, `"2"`, `"3"`) or empty string.

### `class RaceControlFeedWindow(PitWallWindow)`
The primary race control feed window.

- `__init__(self)`:
  Initializes seen hash set (`_seen_hashes`), UI state (`_state = "init"`), frame tracker (`_last_frame_index = -1`), window title, and dimensions (420x620).
- `setup_ui(self)`:
  Constructs the layout:
  - Header: Fixed 56px top banner showing `"RACE CONTROL"` title and `_status_line` displaying current lap and race clock.
  - Event Viewer (`QTextBrowser`): Rich HTML text widget with custom vertical scrollbar styling and external links disabled.
  - State Placeholder (`QLabel`): Centered label displaying waiting or no-data notices when the feed is empty.
- `_set_state(self, state: str)`:
  Controls visibility transitions:
  - `"active"`: Hides placeholder label, shows `QTextBrowser`.
  - `"waiting"`: Displays `_WAITING_TEXT`, hides browser.
  - `"no_data"`: Displays `_NO_DATA_TEXT`, hides browser.
- `on_telemetry_data(self, data: dict)`:
  Frame update hook:
  - Updates header status line with `"Lap X/Total · HH:MM:SS"`.
  - Detects replay rewind/restart (`frame_idx < self._last_frame_index`), clearing `_seen_hashes` and the text browser.
  - Sets state to `"waiting"` or `"no_data"` based on `has_rc_data` flag.
  - Iterates over `race_control_events` array, filtering messages by unique hash key:
    $$\text{Hash} = \text{Time} \parallel \text{Message}$$
  - Calls `_add_event_item(event)` for new messages.
- `_add_event_item(self, event: dict)`:
  Generates an HTML table row containing:
  1. A 3px-wide vertical colored accent indicator bar.
  2. Fixed-width timestamp formatted in monospace font (`Consolas`).
  3. The official FIA message text with optional sector sub-label (`"Sector X"`).
  Appends the HTML snippet to `_text_browser` and auto-scrolls to the bottom.
- `on_connection_status_changed(self, status: str)`:
  Updates the header status line to `"Disconnected"` (red) or `"Connecting..."` (orange) when the TCP socket shifts states.

### Global Functions
- `main()`:
  Initializes `QApplication` and launches `RaceControlFeedWindow`.

---

## Core Logic

1. **State-Driven HTML Text Browser Rendering**:
   Rather than managing hundreds of individual `QWidget` items inside a `QVBoxLayout` (which degrades Qt layout performance over long races), `RaceControlFeedWindow` utilizes a single `QTextBrowser` appending lightweight HTML table fragments. This enables hardware-accelerated text scrolling, fluid window resizing, and unified clipboard copying.

2. **Deduplication and Instant Reconnection Sync**:
   The telemetry server broadcasts all historical race control events up to current session time in each packet. The window maintains an in-memory hash set of seen events (`_seen_hashes`). When a user opens the Race Control Feed mid-race, the window consumes the entire event history in a single burst, suppresses duplicates, and displays the complete chronological log instantaneously.

3. **Replay Scrubbing and Rewind Handling**:
   When the user drags the timeline backwards or restarts the session, `frame_index < _last_frame_index` is detected. The feed flushes the browser and clears `_seen_hashes`, allowing events to replay naturally in forward chronological sequence.
