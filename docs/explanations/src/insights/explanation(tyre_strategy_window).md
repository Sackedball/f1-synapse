# Explanation: `src/insights/tyre_strategy_window.py`

## High-Level Overview
`src/insights/tyre_strategy_window.py` implements the Live Tyre Strategy insight window. Built with PySide6, it renders an authentic Formula 1 pit wall tyre strategy timeline. Each driver is displayed as a horizontal row with position badges, driver acronyms, and multi-colored linear-gradient stint blocks representing tyre compounds (Soft, Medium, Hard, Intermediate, Wet) plotted across the total race laps. The window features persistent state caching (`computed_data/tyre_state.json`), automatic session restart/rewind detection, and coalesced 250ms UI update flushing via `QTimer`.

---

## Dependencies

### Standard Library
- `sys`: Accesses Python system arguments (`sys.argv`) and handles process exit (`sys.exit`).
- `json`: Serializes and deserializes driver stint histories to and from disk (`computed_data/tyre_state.json`).
- `os`: Creates cache directories and verifies file paths.

### External Libraries
- `PySide6.QtWidgets`: UI presentation elements (`QApplication`, `QWidget`, `QVBoxLayout`, `QHBoxLayout`, `QLabel`, `QScrollArea`, `QFrame`, `QSizePolicy`).
- `PySide6.QtGui`: Custom 2D painting tools (`QFont`, `QPainter`, `QColor`, `QPen`, `QBrush`, `QLinearGradient`).
- `PySide6.QtCore`: Core Qt geometry and timers (`Qt`, `QRect`, `QTimer`).

### Internal Modules
- `src.gui.pit_wall_window.PitWallWindow`: Base window architecture handling TCP network connections, themes, and window lifecycles.

---

## Classes & Functions

### Module Constants & Color Palette
- Tyre Compound Colors (`TYRE_COLOURS`):
  - `1.0`: Soft (Red `#E8002D`, letter `"S"`)
  - `2.0`: Medium (Yellow `#FFF200`, letter `"M"`)
  - `3.0`: Hard (White `#CACACA`, letter `"H"`)
  - `4.0`: Intermediate (Green `#39B54A`, letter `"I"`)
  - `5.0`: Wet (Blue `#0067FF`, letter `"W"`)
- `TYRE_REMAP`: Maps 0-indexed integer compounds (0=Soft, 1=Medium, 2=Hard, 3=Inter, 4=Wet) to float identifiers (1.0 to 5.0).
- UI Theme: `BG` (`#0f0f0f`), `ROW_BG` (`#15151e`), `HEADER_BG` (`#111111`), `ACCENT` (`#e10600`), `TEXT_WHITE` (`#ffffff`), `TEXT_DIM` (`#888888`), `BORDER` (`#2a2a2a`).

### `class StintBar(QWidget)`
Custom graphical row representing a single driver's tyre stints.

- `__init__(self, code, stints, total_laps, position=None, current_lap=1, parent=None)`:
  Configures fixed row height (28px), expanding horizontal size policy, driver code, stint arrays, and position badge.
- `update_data(self, stints, total_laps, position=None, current_lap=1)`:
  Updates stint and lap state, triggering a redraw via `self.update()`.
- `paintEvent(self, event)`:
  Renders using antialiased `QPainter`:
  - Position badge: Gold (`#FFD700`) for P1, Red (`#e10600`) for P2/P3, Dark Gray (`#222222`) for P4+.
  - Driver 3-letter acronym text.
  - Background track corresponding to total race distance.
  - Stint Blocks: Iterates through each driver stint:
    - Calculates start and end pixel coordinates based on lap numbers:
      $$x_1 = \text{bar\_x} + \frac{s_{\text{lap}} - 1}{L_{\text{total}}} \times \text{bar\_w}$$
      $$x_2 = \text{bar\_x} + \frac{e_{\text{lap}} - 1}{L_{\text{total}}} \times \text{bar\_w}$$
    - Paints 3-stop vertical `QLinearGradient` (lighter top, base body, darker bottom).
    - If block width $> 14\text{px}$, draws compound letter ("S", "M", "H", "I", "W") centered with high-contrast text color (black text on yellow/white, white text on red/green/blue).
  - Vertical dotted white line showing current session lap.
  - Bottom row separator line (`BORDER`).

### `class LapAxisWidget(QWidget)`
Custom footer widget that renders calibrated lap numbers across the bottom of the strategy chart.

- `__init__(self, total_laps=60, parent=None)`:
  Initializes fixed height (24px) and lap count.
- `set_total_laps(self, n: int)`:
  Updates total laps and repaints.
- `paintEvent(self, event)`:
  Computes horizontal tick spacing ($\approx 10$ subdivisions) and paints centered lap number strings aligned with the stint bars above.

### `class TyreStrategyWindow(PitWallWindow)`
The primary tyre strategy dashboard window.

- `__init__(self)`:
  - Initializes tracking structures: `stints`, `prev_tyres`, `positions`, `_row_widgets`.
  - Attempts to restore cached state from disk via `_load_state()`.
  - Calls `super().__init__()` to trigger UI and networking.
  - Instantiates `QTimer` firing every 250ms (`_flush_redraw`) to throttle graphical updates.
- `_load_state(self)`:
  Reads `computed_data/tyre_state.json`. Validates that stint lap ranges are logically consistent ($e_{\text{lap}} \ge s_{\text{lap}}$). If corrupted, starts fresh.
- `_save_state(self)`:
  Serializes active stints, positions, previous compounds, and lap counters into `computed_data/tyre_state.json`.
- `closeEvent(self, event)`:
  Saves state to disk before calling base class destruction.
- `setup_ui(self)`:
  Builds layout:
  - Header: F1 checkered flag, bold "TYRE STRATEGY" title, and live lap indicator ("LAP X / Y").
  - Legend: Colored circular indicators detailing Soft, Medium, Hard, Intermediate, and Wet.
  - Scroll Area: Scrollable container containing driver `StintBar` widgets.
  - Footer Axis: `LapAxisWidget`.
  - Status Bar: Connection indicator and active driver count.
- `on_telemetry_data(self, data: dict)`:
  Packet ingestion handler:
  - Detects new sessions (`total_laps` mismatch) and wipes old state.
  - Detects session rewinds (`new_lap < current_lap - 1`) and flushes active stints.
  - Normalizes compound codes via `TYRE_REMAP`.
  - Identifies compound changes (`tyre != self.prev_tyres[code]`):
    - Closes previous stint: `stints[code][-1]["end_lap"] = lap - 1`.
    - Opens new stint: `stints[code].append({"tyre": tyre, "start_lap": lap, "end_lap": None})`.
  - Sets `_redraw_pending = True`.
- `_flush_redraw(self)`:
  Executed every 250ms by `_timer`:
  - Updates header labels and bottom axis.
  - Sorts drivers by current track position (P1 at top, descending).
  - Dynamically updates or instantiates `StintBar` widgets and inserts them in sorted order into `rows_layout`.

---

## Core Logic

1. **State Machine for Live Stint Tracking**:
   Telemetry streams provide the driver's current compound frame-by-frame. The window tracks `prev_tyres[code]`. When a driver enters the pit lane and exits on new rubber, a state transition is detected: the current stint's `end_lap` is finalized, and a new open-ended stint (`end_lap = None`) is appended. While a stint is active, its block dynamically stretches to `current_lap`.

2. **Session Reset and Rewind Resilience**:
   During interactive replay, users often jump backward along the timeline or load an entirely different race. The ingestion engine checks whether `new_lap < current_lap - 1` or if `total_laps` changes. When detected, stale stint records and `StintBar` UI rows are purged, preventing corrupted or overlapping stint bars.

3. **Throttled Coalesced Redrawing (250ms Timer)**:
   Calling Qt widget insertions and full repaints at 60 Hz causes visual stutter. Telemetry parsing runs continuously, flagging `_redraw_pending = True`. A dedicated 250ms `QTimer` flushes layout reordering and repaints, ensuring silky-smooth scrolling and responsive window resizing.
