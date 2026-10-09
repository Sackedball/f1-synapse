# Explanation: `src/insights/lap_time_chart_window.py`

## High-Level Overview
`src/insights/lap_time_chart_window.py` implements the interactive Lap Time & Gap Evolution insight window. Built using PySide6 and Matplotlib, it visualizes driver lap time consistency, stint degradation, and interval gaps to the race leader as the simulation unfolds. It provides interactive crosshair tooltips, tyre compound markers (Soft, Medium, Hard, Intermediate, Wet), Safety Car / VSC shaded zones, pit stop annotations with tyre compound transitions, a "Pure Pace" filter that suppresses pit laps/yellow flag anomalies, interactive click-to-isolate legend toggles, and an undo/redo zoom-and-pan navigation history.

---

## Dependencies

### Standard Library
- `sys`: Command-line interface access and process exit handling.
- `time`: Performance profiling, monotonic timestamp calculation for rendering rates, and hover debounce timers.

### External Libraries
- `numpy`: High-speed vector manipulation and mathematical operations.
- `matplotlib`: Core plotting library using the `"QtAgg"` GUI backend (`FigureCanvasQTAgg`).
- `matplotlib.lines` (`mlines`), `matplotlib.pyplot` (`plt`), `matplotlib.ticker` (`ticker`): Line geometries, subplots, and custom axis formatters.
- `PySide6.QtWidgets`: UI presentation elements (`QApplication`, `QWidget`, `QVBoxLayout`, `QHBoxLayout`, `QLabel`, `QComboBox`, `QPushButton`, `QCheckBox`).
- `PySide6.QtGui`: Fonts (`QFont`, `QFontMetrics`), mouse cursors (`QCursor`).
- `PySide6.QtCore`: Core Qt constants (`Qt`), event filtering (`QEvent`), and asynchronous timers (`QTimer`).

### Internal Modules
- `src.gui.pit_wall_window.PitWallWindow`: Base window architecture handling TCP telemetry streaming, status bar counters, and application theme.
- `src.lib.tyres`: Tyre compound enum conversions (`get_tyre_compound_int`, `get_tyre_compound_str`).

---

## Classes & Functions

### Color & Typography Helper Functions
- `_hex_to_rgb01(colour)` / `_rgb01_to_hex(rgb)`: Converts between 7-character hexadecimal strings (`#RRGGBB`) and normalized floats $[0.0, 1.0]$.
- `_srgb_to_linear(channel)`: Linearizes sRGB color gamma for accurate perceptual photometry.
- `_relative_luminance(rgb)`: Calculates photometric luminance per WCAG standards:
  $$L = 0.2126 R_{\text{lin}} + 0.7152 G_{\text{lin}} + 0.0722 B_{\text{lin}}$$
- `_contrast_ratio(fg_hex, bg_hex)`: Computes WCAG contrast ratio between text and background:
  $$\text{Ratio} = \frac{L_1 + 0.05}{L_2 + 0.05}$$
- `_mix_rgb(rgb_a, rgb_b, amount)`: Linearly interpolates two RGB tuples.
- `_display_safe_colour(colour, bg_colour, min_contrast=3.2)`: Binary search that brightens dark team liveries (e.g. Kick Sauber, Mercedes, Red Bull dark blues) with white until WCAG contrast thresholds are satisfied against the dark `#15151e` canvas.
- `_format_laptime(seconds, _pos=None) -> str`: Formats floating-point seconds into standard F1 timing notation (`M:SS.s` for axis ticks, `M:SS.sss` for tooltips).
- `_format_delta(seconds, _pos=None) -> str`: Formats timing deltas with signed indicators (`+0.123s`, `-0.456s`, or `0.000s`).
- `_moving_average(values, window)`: Calculates rolling $N$-lap moving averages for pace trends, padding initial indices with `None`.

### Classification Predicates
- `_entry_is_pit_entry(entry)`: Returns `True` if the lap was an in-lap into the pit lane.
- `_entry_is_pit_affected(entry, pit_threshold)`: Identifies laps slowed down by pit stop transitions.
- `_entry_is_out_lap(entry)`: Returns `True` if the lap was an out-lap exiting the pits.
- `_entry_is_outlier(entry, pit_threshold)`: Detects laps exceeding pace thresholds caused by spins, damage, or yellow flags.
- `_is_clean_timed_entry(entry, pit_threshold, sc_vsc_laps)`: Returns `True` if a lap represents unhampered racing pace.
- `_entry_has_gap_discontinuity(entry, pit_threshold, sc_vsc_laps)`: Flags laps where timing gaps cannot be cleanly interpolated.
- `_terminal_status_display_text(status)`: Formats retirement statuses (e.g. "Retired (DNF)", "Collision", "Engine").

### `class _OverlayBlitManager`
High-performance Matplotlib blitting manager. Captures the pixel buffer of the base chart (`copy_from_bbox`) and uses hardware `blit()` to render interactive crosshairs and tooltips at 60 FPS without redrawing lines, spines, or axes.

### `class LapTimeChartWindow(PitWallWindow)`
The primary lap time and gap analysis window.

- `__init__(self)`:
  Initializes internal data stores, zoom/pan stacks, layout geometries, blitting managers, and timers (`_render_timer`, `_resize_refresh_timer`, `_view_refresh_timer`).
- `setup_ui(self)`:
  Builds the control toolbar:
  - `_driver_combo`: Selects a specific driver or "All Drivers".
  - `_ymode_combo`: Switches y-axis between **"Lap Time"** (absolute seconds) and **"Gap to Leader"** (delta seconds).
  - `_pure_pace_cb`: Checkbox toggling "Pure Pace" mode (filtering out SC periods and pit stop in/out laps).
  - `_undo_btn`, `_redo_btn`, `_reset_btn`: View navigation buttons.
  - `_help_btn`: Toggles keyboard and mouse feature walkthrough overlay.
  - Live HUD labels showing current session lap and race clock.
  - Matplotlib canvas embedding `_fig` and `_ax` styled with F1 dark aesthetics.
- `on_telemetry_data(self, data: dict)`:
  Paces data ingestion from the telemetry stream:
  - Ingests `lap_times`, `status_laps`, `driver_colors`, and `session_data`.
  - Detects session rewinds and resets user view limits accordingly.
  - Coalesces redraw calls using `_request_live_render()` to maintain consistent frame rates.
- `_redraw(self)`:
  Main charting pipeline:
  1. Clears axes and applies dark background formatting.
  2. Identifies visible laps up to current session time.
  3. Evaluates median race pace and computes dynamic `pit_threshold` ($\text{Median} + \max(15.0, \text{Median} \times 0.12)$).
  4. Renders vertical shaded spans for Safety Car (`_SC_COLOUR`), VSC (`_VSC_COLOUR`), and Red Flags (`_RED_FLAG_COLOUR`).
  5. If **Gap Mode** is active:
     - Identifies leader reference lap times at the timing line.
     - Anchors gaps using official FIA extended stream intervals.
     - Interpolates continuous gap lines between timing anchors.
  6. If **Lap Time Mode** is active:
     - Plots lap times connected by team-colored lines.
     - Colors purple markers for overall fastest lap and green markers for driver personal bests.
     - Plots tyre compound glyphs (Circle = Soft, Square = Medium, Triangle = Hard, Diamond = Inter, Star = Wet).
  7. Draws vertical dashed markers with compound labels for pit stops.
  8. Computes rolling 3-lap moving average pace trendlines.
  9. Builds interactive legend with custom hitboxes for click-to-isolate toggling.
- `_on_mouse_move(self, event: MouseEvent)`:
  Detects cursor position over the chart or legend. If hovering over a valid lap marker, updates the vertical/horizontal crosshair lines and positions a tooltip displaying driver, lap number, time, gap, tyre compound, and tyre life.
- `_on_pick(self, event)`:
  Toggles driver isolation when a user clicks a driver's line on the plot or in the legend.
- `_on_button_press(self, event)` / `_on_button_release(self, event)`:
  Implements drag-to-pan in pixel space, preventing feedback jitter.
- `eventFilter(self, obj, event)`:
  Handles mouse wheel scrolling (zooming centered at cursor position) and pinch gestures.

---

## Core Logic

1. **Hardware-Accelerated Blitting**:
   Redrawing thousands of data points, shaded regions, and spine ticks on mouse motion causes stutter. `_OverlayBlitManager` isolates dynamic crosshair lines and annotation tooltips into an animated overlay layer. When the mouse moves, the base plot is restored directly from pixel memory (`restore_region`), and only the crosshairs are redrawn and blitted.

2. **Official Gap Reconstruction with Anchor Interpolation**:
   In live F1 timing, official gaps to the leader are recorded only at the finish line transponder loop. In-between, cars pull away or close in along track sectors. The module correlates official timing stream intervals with frame timestamps, using linear interpolation between known transponder anchors to eliminate jitter while matching official FIA gap classifications.

3. **Dynamic WCAG Contrast Tuning**:
   Formula 1 teams frequently use dark blue (Red Bull), turquoise-black (Mercedes), or dark charcoal colors that disappear against a dark `#15151e` canvas. `_display_safe_colour` uses a binary search over linear luminance to lighten colors just enough to meet a 3.2:1 contrast ratio while preserving the recognizable team hue.
