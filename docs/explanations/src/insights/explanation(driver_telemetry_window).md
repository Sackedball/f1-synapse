# Explanation: `src/insights/driver_telemetry_window.py`

## High-Level Overview
`src/insights/driver_telemetry_window.py` is a specialized desktop analysis tool embedded within the Pit Wall suite. Built with PySide6 and Matplotlib, it renders synchronized, high-frequency telemetry curves for any selected driver in real time. The window presents three stacked strip charts with proportional vertical height ratios (50% Speed, 25% Gear, 25% Throttle & Brake). It supports two dynamic x-axis reference modes: a rolling 30-second temporal window and an along-track lap distance window.

---

## Dependencies

### Standard Library
- `sys`: Command-line arguments (`sys.argv`) and application exit handling (`sys.exit`).
- `collections.deque`: Ring buffers for managing rolling 30-second telemetry histories.

### External Libraries
- `matplotlib`: Core plotting engine configured with the `"QtAgg"` GUI backend.
- `matplotlib.pyplot` & `matplotlib.gridspec`: Layout management for 3-row stacked subplots with customized height ratios (`[2, 1, 1]`) and zero vertical gaps.
- `matplotlib.ticker`: Custom tick formatting for distances and time axes.
- `matplotlib.backends.backend_qtagg.FigureCanvasQTAgg`: Embeds the interactive Matplotlib figure inside a PySide6 Qt widget.
- `PySide6.QtWidgets`: GUI layout elements (`QApplication`, `QWidget`, `QVBoxLayout`, `QHBoxLayout`, `QLabel`, `QComboBox`).
- `PySide6.QtGui.QFont`: Typography configuration for toolbar controls and headers.

### Internal Modules
- `src.gui.pit_wall_window.PitWallWindow`: Base window architecture handling TCP telemetry streaming, F1 styling, and status bars.

---

## Classes & Functions

### Module Constants
- `_TIME_WINDOW` (30): Time horizon in seconds for rolling-time mode.
- Color Palette: `_BG` (`#15151e` dark asphalt), `_SPEED_COL` (`#F0F0F0` white), `_GEAR_COL` (`#B0B0B0` light gray), `_THROT_COL` (`#2ECC71` bright green), `_BRAKE_COL` (`#E74C3C` racing red).

### `class DriverTelemetryWindow(PitWallWindow)`
Interactive multi-trace telemetry window.

- `__init__(self)`:
  Initializes driver tracking lists, buffer dictionaries (`_time_buffers`, `_lap_buffers`, `_lap_lengths`), circuit length storage, and sets default x-axis mode to `"time"`. Calls `super().__init__()`.
- `setup_ui(self)`:
  Constructs the layout:
  - Top Control Bar:
    - `driver_combo`: Dropdown selector populated with active driver codes.
    - `xmode_combo`: Dropdown toggling between `"Last 30 seconds"` and `"Current Lap"`.
  - Matplotlib Canvas:
    - 3-row `GridSpec` with height ratios `[2, 1, 1]`:
      1. Speed Panel: 0 to 380 km/h y-axis.
      2. Gear Panel: Step plot (`steps-post`) with discrete integer ticks 1 to 8.
      3. Throttle/Brake Panel: Overlaid curves from -5% to 105% (Green throttle line, Red brake line).
    - Custom dark styling (`#15151e` facecolor, `#555555` spines, white tick labels).
- `_on_xmode_changed(self, index: int)`:
  Updates `self._x_mode` to `"time"` or `"lap"`, configures axis labels and tick formatters via `_apply_xmode_labels()`, and triggers a redraw.
- `_apply_xmode_labels(self)`:
  Swaps bottom axis label between `"Time (s)"` (negative relative time from 0 to -30s) and `"Distance (m)"` (0 to circuit length).
- `_ensure_buffers(self, code: str)`:
  Ensures storage structures exist for a driver code:
  - `_time_buffers[code]`: `deque` of samples `{"t", "speed", "gear", "throttle", "brake"}`.
  - `_lap_buffers[code]`: Dict tracking current lap index, lap start distance, and sample list.
- `_append_sample(self, code: str, driver: dict, session_t: float)`:
  Extracts speed, gear, throttle, brake (scaled from 0.0-1.0 to 0-100%), and track distance.
  - Time mode: Appends sample to deque and evicts frames where $t < \text{session\_t} - 30.0$.
  - Lap mode: Detects when `driver["lap"]` increments, stores the completed lap's total distance in `_lap_lengths`, resets sample list, and computes relative lap distance:
    $$\text{LapDist} = \text{dist} - \text{start\_dist}$$
- `_refresh_driver_list(self, drivers: dict)`:
  Populates `driver_combo` when new driver codes appear in incoming telemetry frames, preserving currently selected driver without re-triggering unnecessary selection events.
- `_redraw(self, driver_code: str)`:
  Dispatches to `_redraw_time` or `_redraw_lap` based on mode, then calls `self._canvas.draw_idle()`.
- `_redraw_time(self, code: str)`:
  Extracts time buffer samples, shifts x-values so the newest sample is at $x = 0$ (past samples span $-30 \le x \le 0$), updates Matplotlib Line2D objects, and locks axis limits to `[-30, 0]`.
- `_redraw_lap(self, code: str)`:
  Extracts lap samples, maps along-track distance along the x-axis, updates line data, and sets x-axis limits to the full lap length (derived from session circuit length or prior lap distance).
- `_set_lines(self, xs, speeds, gears, throttles, brakes)`:
  Updates coordinates of `_line_speed`, `_line_gear`, `_line_throt`, and `_line_brake`.
- `_clear_lines(self)`:
  Resets all plot curves to empty data and flushes the canvas.
- `on_telemetry_data(self, data: dict)`:
  Base class override:
  - Captures `circuit_length_m`.
  - Refreshes driver dropdown list.
  - Ingests telemetry for all drivers into ring buffers.
  - Redraws charts for the currently selected driver.
- `on_connection_status_changed(self, status: str)`:
  Clears lines if connection drops.

### Global Functions
- `main()`:
  Standalone launcher instantiating `QApplication` and `DriverTelemetryWindow`.

---

## Core Logic

1. **Lightweight Canvas Redraws (`draw_idle`)**:
   Calling `plt.draw()` directly on every frame blocks the GUI thread and drops frame rates. Instead, the window modifies existing `Line2D` objects in-place via `line.set_data(xs, ys)` and invokes `canvas.draw_idle()`, allowing Qt's event loop to coalesce redundant redraw requests during high-speed replay scrubbing.

2. **Dual-Domain Temporal vs. Spatial Projection**:
   - **Time Horizon Mode**: Visualizes driver inputs over the last 30 seconds relative to the current moment ($x \in [-30, 0]$), ideal for observing how a driver reacted to a recent spin, overtake, or lockup.
   - **Lap Distance Mode**: Visualizes driver inputs across the entire lap from meter 0 to the finish line, ideal for identifying exact braking points, throttle pick-up points, and gear shifts corner-by-corner.
