# Explanation: `src/insights/track_position_window.py`

## High-Level Overview
`src/insights/track_position_window.py` provides a 2D radar and circuit positioning insight window. It renders real-time driver positions across the circuit in two interchangeable visual presentation modes:
1. **Real Track View**: The authentic GPS/metric geometric circuit shape with inner boundaries, outer boundaries, asphalt road surface, start/finish line, and kilometer distance markers.
2. **Circular Schematic View**: An idealized circular ring radar that simplifies relative driver spacing, gaps, and overtaking positioning.

The window features off-screen background caching (`QPixmap`), dynamic halo-illuminated driver markers, and an animated golden leader arrowhead indicator.

---

## Dependencies

### Standard Library
- `sys`: Command-line arguments (`sys.argv`) and process exit handling (`sys.exit`).
- `math`: Geometric functions (`radians`, `sin`, `cos`, `hypot`, `atan2`, `pi`).

### External Libraries
- `PySide6.QtWidgets`: UI presentation elements (`QApplication`, `QWidget`, `QVBoxLayout`, `QHBoxLayout`, `QLabel`, `QPushButton`).
- `PySide6.QtCore`: Core Qt geometry and flags (`Qt`, `QPointF`).
- `PySide6.QtGui`: Custom 2D hardware-accelerated drawing primitives (`QPainter`, `QPen`, `QBrush`, `QColor`, `QFont`, `QFontMetrics`, `QPolygonF`, `QPainterPath`, `QPixmap`).

### Internal Modules
- `src.gui.pit_wall_window.PitWallWindow`: Base window architecture handling TCP network connections, dark themes, and lifecycle hooks.

---

## Classes & Functions

### Module Constants & Color Palette
- Visual Distinct Palette (`_PALETTE`): 20 unique hex colors assigned sequentially to drivers if team colors are not supplied.
- Canvas Colors: `_TRACK_BG` (`#15151e`), `_TRACK_ROAD` (`#383838`), `_TRACK_EDGE` (`#555555`), `_TRACK_CENTRE` (`#2a2a2a`), `_TRACK_RING_DARK` (`#303030`), `_SF_LINE_COLOR` (`#FFFFFF`), `_LEADER_ARROW` (`#FFD700`).

### `class _TrackMapWidget(QWidget)`
Custom 2D canvas widget handling geometry transformation and drawing.

- `__init__(self, parent=None)`:
  Initializes coordinate lists (`_center_xs`, `_inner_xs`, `_outer_xs`), cumulative distance fraction arrays (`_cum_fracs`), cached background pixmap (`_cached_bg = None`), and sets minimum size (420x420).
- `set_track_geometry(...)`:
  Ingests track polylines broadcast from the replay server. Centers and applies rotation angle, builds cumulative segment lengths, and normalizes them into fractional distances $[0.0, 1.0]$. Sets `has_real_track = True` and invalidates background cache.
- `update_positions(positions: dict, colors: dict, leader_code: str, circuit_length_m: float)`:
  Updates normalized driver track positions, livery colors, leader code, and triggers Qt repaint (`self.update()`).
- `paintEvent(self, event)`:
  Initializes `QPainter` with antialiasing and text antialiasing. Clears canvas and routes to either `_paint_real_track` or `_paint_circle_track`.
- `_paint_real_track(self, painter: QPainter)`:
  1. Computes bounding box of all inner/outer points and derives aspect-ratio preserving scale factor.
  2. If `_cached_bg` is invalid:
     - Instantiates `QPixmap(self.size())`.
     - Fills road polygon between inner and outer edge paths using `_TRACK_ROAD`.
     - Draws inner and outer boundary outlines (`_TRACK_EDGE`, 2px).
     - Draws dashed centerline (`_TRACK_CENTRE`).
     - Draws start/finish line and `"S/F"` text.
     - Draws kilometer tick marks (1K, 2K, 3K, ...) perpendicular to the track centerline.
  3. Paints cached background pixmap onto screen.
  4. Plots all driver dots along the centerline using `_pos_on_track(fraction)`.
  5. Renders a golden directional arrowhead pointing along track tangency ahead of the race leader.
- `_paint_circle_track(self, painter: QPainter)`:
  1. Computes circle center and radius.
  2. If `_cached_bg` is invalid:
     - Paints 22px-thick dark ring track with inner stroke.
     - Draws start/finish line at angle $-\frac{\pi}{2}$ (12 o'clock).
     - Renders radial distance ticks and labels.
  3. Paints cached background pixmap.
  4. Maps driver positions to polar coordinates:
     $$\theta = -\frac{\pi}{2} + 2\pi \times \text{Fraction}$$
  5. Draws driver dots with outward-facing drop-shadowed labels.
  6. Renders leader arrowhead.
- `_pos_on_track(fraction, to_widget) -> tuple[float, float]`:
  Performs binary search (`_frac_to_index`) over `_cum_fracs` to find the bounding polyline segment, interpolates coordinates, and transforms to widget pixel space.
- `_draw_driver_dot(painter, x, y, code, color)`:
  Renders a 7px driver circle with translucent halo ring, black border, drop shadow, and team-colored 3-letter acronym text.
- `_draw_leader_arrow_at(painter, x, y, angle)`:
  Constructs a rotated triangular polygon pointing along track tangency with a drop shadow.

### `class TrackPositionWindow(PitWallWindow)`
The primary track position insight window.

- `__init__(self)`:
  Sets window title and dimensions (520x560), and initializes geometry flags.
- `setup_ui(self)`:
  Constructs:
  - Top status bar: `_lap_label`, `_track_label`, `_circuit_label`.
  - View Mode Toggle: Dual button group ("Circular" vs. "Real Track").
  - Central canvas: Instantiates `_TrackMapWidget`.
- `_set_view_mode(self, mode: str)`:
  Updates `self._map.force_circle`, invalidates cached pixmap, updates active red button styles, and triggers repaint.
- `on_telemetry_data(self, data: dict)`:
  Extracts circuit length, track status flags, driver colors, and one-time `track_geometry` payloads. Normalizes driver track positions ($s / L_{\text{circuit}}$ or `fraction`), identifies race leader (P1), and updates `_map`.
- `on_connection_status_changed(self, status: str)`:
  Updates `_track_label` status text.

### Global Functions
- `main()`:
  Standalone launcher instantiating `QApplication` and `TrackPositionWindow`.

---

## Core Logic

1. **Off-Screen Pixel Caching (`QPixmap`)**:
   Drawing complex road polygons comprising thousands of inner/outer GPS vertices and text labels on every telemetry frame at 60 FPS creates high GPU and CPU load. `_TrackMapWidget` draws the entire circuit layout, start/finish line, and distance markers into an off-screen `QPixmap` once. Each live frame only draws the cached background pixmap and overlays the 20 driver dots, maintaining negligible CPU utilization.

2. **Curvilinear Centerline Interpolation (`_cum_fracs`)**:
   In Real Track mode, cars are positioned along the track centerline using normalized fraction $[0.0, 1.0]$. The widget computes cumulative Euclidean distances along all vertices at initialization and uses binary search (`_frac_to_index`) in $O(\log N)$ time to find the exact line segment, linearly interpolating coordinates along corners and straights.

3. **Tangential Leader Orientation**:
   To render the golden leader arrowhead, the widget samples the next vertex along the centerline ($idx + 1$) and calculates the orientation angle:
   $$\theta = \text{atan2}(y_{idx+1} - y_{idx}, x_{idx+1} - x_{idx})$$
   This guarantees that the arrowhead rotates smoothly, pointing naturally into braking zones, chicanes, and straightaways.
