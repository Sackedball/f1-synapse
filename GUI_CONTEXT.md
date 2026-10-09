# GUI Context & Architecture Reference

> **Standing reference for AI sessions and contributors working on the GUI.**  
> *Last updated: September 2026*  
> *Do not modify this document with speculative notes; verify every detail against the source code.*

---

## 1. What This Project Is

F1 Synapse (formerly F1 Race Replay) is a desktop motorsport simulation and pit-wall telemetry analysis suite built in Python. It ingests official timing and sensor data via FastF1, resamples all channels onto a synchronized 25 FPS monotonic timeline, and simulates race kinematic states (including Safety Car movements and track status flags). The GUI layer is split across two graphical engines: a high-framerate 2D OpenGL canvas (Python Arcade) for real-time race/qualifying circuit replay and on-track car animation, and a multi-window analytical pit-wall dashboard suite (PySide6 / Qt) receiving broadcast telemetry frames over a local TCP socket.

---

## 2. GUI Architecture Map

### 2.1 Entry Points & Orchestration
- [`main.py`](file:///c:/Users/samik/OneDrive/Documenti/F1%20project/f1-race-replay/main.py): Application entry point and CLI router. Launches either the PySide6 session selector (`RaceSelectionWindow`), CLI loader (`cli_load`), or directly initializes headless/visual replay sessions (`main(..., visible_hud=True)`).
- [`src/run_session.py`](file:///c:/Users/samik/OneDrive/Documenti/F1%20project/f1-race-replay/src/run_session.py): Replay wrapper. Spawns `F1RaceReplayWindow` inside `arcade.run()` and launches the PySide6 `InsightsMenu` in a separate background daemon process via `subprocess.run([sys.executable, "-m", "src.gui.insights_menu"])` ([`src/run_session.py:54-64`](file:///c:/Users/samik/OneDrive/Documenti/F1%20project/f1-race-replay/src/run_session.py#L54-L64)).

### 2.2 Primary 2D Canvas Windows (Arcade / Pyglet OpenGL)
- [`src/interfaces/race_replay.py`](file:///c:/Users/samik/OneDrive/Documenti/F1%20project/f1-race-replay/src/interfaces/race_replay.py): `F1RaceReplayWindow` (subclasses `arcade.Window`). Hosts the 25 FPS race replay render loop, world-to-screen coordinate transforms, auto-fitting camera, driver tracking, and the TCP `TelemetryStreamServer` publisher on port 9999 ([`src/interfaces/race_replay.py:47-58`](file:///c:/Users/samik/OneDrive/Documenti/F1%20project/f1-race-replay/src/interfaces/race_replay.py#L47-L58)).
- [`src/interfaces/qualifying.py`](file:///c:/Users/samik/OneDrive/Documenti/F1%20project/f1-race-replay/src/interfaces/qualifying.py): `QualifyingReplay` (subclasses `arcade.Window`). Interactive qualifying viewer featuring stacked line charts (Speed, Gear, Throttle/Brake) synchronized with an animated circuit mini-map and benchmark comparison traces.

### 2.3 Main HUD & Canvas Components ([`src/ui_components.py`](file:///c:/Users/samik/OneDrive/Documenti/F1%20project/f1-race-replay/src/ui_components.py))
- **`LeaderboardComponent`** ([`src/ui_components.py:246`](file:///c:/Users/samik/OneDrive/Documenti/F1%20project/f1-race-replay/src/ui_components.py#L246)): Live standings table on the right edge. Handles gap calculations (Interval `I` vs. Leader `L`), DNF/PIT/OUT badges, tyre compound icons, and click-to-select driver highlight rows.
- **`WeatherComponent`** ([`src/ui_components.py:145`](file:///c:/Users/samik/OneDrive/Documenti/F1%20project/f1-race-replay/src/ui_components.py#L145)): Displays air/track temperature, humidity, wind direction/speed, and rain condition indicators with custom icons.
- **`DriverInfoComponent`** ([`src/ui_components.py:834`](file:///c:/Users/samik/OneDrive/Documenti/F1%20project/f1-race-replay/src/ui_components.py#L834)): Floating cards on the left edge stacked under the weather panel; displays live speed, gear, DRS status, interval gaps, and tyre health bar for selected driver(s).
- **`RaceProgressBarComponent`** ([`src/ui_components.py:1241`](file:///c:/Users/samik/OneDrive/Documenti/F1%20project/f1-race-replay/src/ui_components.py#L1241)): Timeline scrubber along window bottom with lap markers, DNF event markers, track flag segments, playhead indicator, and hover tooltip overlays.
- **`RaceControlsComponent`** ([`src/ui_components.py:1654`](file:///c:/Users/samik/OneDrive/Documenti/F1%20project/f1-race-replay/src/ui_components.py#L1654)): Playback buttons (Rewind, Play/Pause, Fast-Forward) and playback speed multiplier toggles with hover and keyboard flash animations.
- **`SessionInfoComponent`** ([`src/ui_components.py:1144`](file:///c:/Users/samik/OneDrive/Documenti/F1%20project/f1-race-replay/src/ui_components.py#L1144)): Top-center broadcast banner displaying Grand Prix event name, circuit location, country, season year, round number, and total laps.
- **`LegendComponent`** ([`src/ui_components.py:29`](file:///c:/Users/samik/OneDrive/Documenti/F1%20project/f1-race-replay/src/ui_components.py#L29)): Bottom-left "Help (Click or 'H')" controls trigger.
- **`ControlsPopupComponent`** ([`src/ui_components.py:1005`](file:///c:/Users/samik/OneDrive/Documenti/F1%20project/f1-race-replay/src/ui_components.py#L1005)): Center modal dialog showing hotkey and mouse control references.
- **`LapTimeLeaderboardComponent`** ([`src/ui_components.py:603`](file:///c:/Users/samik/OneDrive/Documenti/F1%20project/f1-race-replay/src/ui_components.py#L603)): Qualifying driver standings table with sector times.
- **`QualifyingLapTimeComponent`** ([`src/ui_components.py:1944`](file:///c:/Users/samik/OneDrive/Documenti/F1%20project/f1-race-replay/src/ui_components.py#L1944)): Qualifying sector and delta time comparisons.
- **`QualifyingSegmentSelectorComponent`** ([`src/ui_components.py:687`](file:///c:/Users/samik/OneDrive/Documenti/F1%20project/f1-race-replay/src/ui_components.py#L687)): Modal dialog for switching between Q1, Q2, and Q3 telemetry traces.
- **`draw_finish_line()`** ([`src/ui_components.py:2290`](file:///c:/Users/samik/OneDrive/Documenti/F1%20project/f1-race-replay/src/ui_components.py#L2290)): Procedurally draws the checkered finish line perpendicular to the track centerline.

### 2.4 Auxiliary Pit Wall Windows (PySide6 / Qt)
- **Base Class [`src/gui/pit_wall_window.py`](file:///c:/Users/samik/OneDrive/Documenti/F1%20project/f1-race-replay/src/gui/pit_wall_window.py)**: `PitWallWindow` (subclasses `QMainWindow`). Establishes standard dark QSS styling, connection status bar, and initializes the background socket subscriber thread (`TelemetryStreamClient`).
- **Launcher [`src/gui/insights_menu.py`](file:///c:/Users/samik/OneDrive/Documenti/F1%20project/f1-race-replay/src/gui/insights_menu.py)**: `InsightsMenu`. Scrollable card interface that spawns and tracks all open pit-wall tool instances.
- **Launcher Window [`src/gui/race_selection.py`](file:///c:/Users/samik/OneDrive/Documenti/F1%20project/f1-race-replay/src/gui/race_selection.py)**: `RaceSelectionWindow`. Standalone session selector for choosing season year, round, and session type.
- **Settings Dialog [`src/gui/settings_dialog.py`](file:///c:/Users/samik/OneDrive/Documenti/F1%20project/f1-race-replay/src/gui/settings_dialog.py)**: `SettingsDialog`. Configuration modal for cache and data folder paths.
- **Insight Tools ([`src/insights/`](file:///c:/Users/samik/OneDrive/Documenti/F1%20project/f1-race-replay/src/insights/))**:
  - `driver_telemetry_window.py`: Live strip charts (Speed, Gear, Throttle/Brake) plotted with Matplotlib `FigureCanvasQTAgg`.
  - `track_position_window.py`: Real-time 2D circuit position radar rendered with custom `QPainter` inside `_TrackMapWidget`.
  - `lap_time_chart_window.py`: Lap pace and gap delta trends rendered via Matplotlib with `_OverlayBlitManager`.
  - `tyre_strategy_window.py`: Driver stint Gantt chart rendered with custom `QPainter` inside `StintBar`.
  - `race_control_feed_window.py`: Color-coded FIA flag and investigation ticker inside a `QTextBrowser`.
  - `ml_prediction_window.py`: Live overtake and pit anticipation probability meters using custom `MetricGauge` widgets.
  - `telemetry_stream_viewer.py`: Low-level JSON socket inspector (*Note: inherits directly from `QMainWindow`, not `PitWallWindow`*).
  - `example_pit_wall_window.py` / `src/gui/pit_wall_window_template.py`: Minimal developer reference template.

### 2.5 IPC & Inter-Window Communication
- **Architecture**: Decoupled publisher-subscriber over local TCP sockets (NOT shared in-memory state or multiprocessing queues).
- **Broadcaster**: `TelemetryStreamServer` ([`src/services/stream.py:11`](file:///c:/Users/samik/OneDrive/Documenti/F1%20project/f1-race-replay/src/services/stream.py#L11)) bound to `localhost:9999`, dispatches newline-delimited JSON frame payloads at 25 Hz from the Arcade thread.
- **Subscriber**: `TelemetryStreamClient` ([`src/services/stream.py:65`](file:///c:/Users/samik/OneDrive/Documenti/F1%20project/f1-race-replay/src/services/stream.py#L65)), a Qt `QThread` emitting Qt signals (`data_received`, `connection_status`, `error_occurred`) directly into the Qt UI event loop.

### 2.6 The 2D Replay Draw Call Chain
Inside [`src/interfaces/race_replay.py:1327`](file:///c:/Users/samik/OneDrive/Documenti/F1%20project/f1-race-replay/src/interfaces/race_replay.py#L1327) (`F1RaceReplayWindow.on_draw`), elements are rendered in this strict order:
1. `self.clear()` (Clears canvas backbuffer)
2. `arcade.draw_lrbt_rectangle_textured(...)` (Background texture, if loaded)
3. `arcade.draw_line_strip(...)` (Inner track ribbon, 4px width, color keyed by flag status)
4. `arcade.draw_line_strip(...)` (Outer track ribbon, 4px width)
5. `arcade.draw_line_strip(...)` (DRS active zones on outer edge, bright green `(0, 255, 0)`, 6px width)
6. `draw_finish_line(self)` (Checkered line pattern at track index 0)
7. On-Track Cars loop:
   - Leader line and driver text label (if labels toggled or driver selected)
   - Car body dot: `arcade.draw_circle_filled(sx, sy, 6, team_color)`
8. Safety Car (if active in frame):
   - Pulsing glow rings and dashed trail (if deploying or returning)
   - Body dot: `arcade.draw_circle_filled(sc_sx, sc_sy, 8, orange_alpha)`
   - Outline ring: `arcade.draw_circle_outline(..., radius=9, 2px)`
   - Text label: "SC" and phase string ("SC DEPLOYING" / "SC IN")
9. Top-Left Static HUD (if `visible_hud`):
   - `self.lap_text.draw()`
   - `self.time_text.draw()`
   - `self.status_text.draw()` (Flag condition banner if yellow/red/SC/VSC)
10. `self.weather_comp.draw(self)` (Weather metrics panel at `top_offset=170`)
11. `self.leaderboard_comp.draw(self)` (Standings table at right margin)
12. `self.legend_comp.draw(self)` (Controls help trigger at bottom left)
13. `self.driver_info_comp.draw(self)` (Selected driver cards stacked under weather)
14. `self.progress_bar_comp.draw(self)` (Bottom timeline bar, lap tick marks, event markers)
15. `self.race_controls_comp.draw(self)` (Playback buttons at bottom center)
16. `self.session_info_comp.draw(self)` (Top-center broadcast banner)
17. `self.controls_popup_comp.draw(self)` (Keyboard shortcut modal overlay, if toggled)
18. `self.progress_bar_comp.draw_overlays(self)` (Hover tooltips drawn last to prevent occlusion)

---

## 3. Current Visual Style (As of Now)

### 3.1 Color Palette
- **Canvas / App Background**: `#15151e` / RGB `(21, 21, 30)` (Arcade canvas, main Qt window surfaces, progress bar background).
- **Card / GroupBox Surfaces**: `#1f1f27` / RGBA `(31, 31, 39, 230)` (Session info banner, driver info cards, Qt table/list widgets).
- **Borders & Dividers**: `#383845` / RGB `(56, 56, 69)` (HUD card outlines, Qt groupbox borders, separators).
- **Button / Interactive Default**: `#2c2c34` (Qt button background, inactive tab headers).
- **F1 Signature Red Accent**: `#e10600` / RGB `(225, 6, 0)` (Hover states, selected leaderboard rows, active toggles, progress bar fill, groupbox titles).
- **Red Highlight / Outline**: `#f5201b` / RGB `(245, 32, 27)`.
- **Text (Primary)**: `#ffffff` / RGB `(255, 255, 255)` / `arcade.color.WHITE`.
- **Text (Secondary / Dimmed)**: `#9494a0` or `#888888` / `arcade.color.LIGHT_GRAY`.
- **Track Status Colors**:
  - Green / Normal: `(150, 150, 150)` (Arcade track) / `#2ECC71` (Feed text)
  - Yellow Flag: `(220, 180, 0)` / `#FFD700`
  - Red Flag: `(200, 30, 30)` / `#E74C3C`
  - Safety Car / VSC: `(255, 165, 0)` / `(200, 130, 50)`
- **Tyre Compound Standard Colors**:
  - Soft (S): `#E8002D` (Red)
  - Medium (M): `#FFF200` (Yellow)
  - Hard (H): `#CACACA` (White / Silver)
  - Intermediate (I): `#39B54A` (Green)
  - Wet (W): `#0067FF` (Blue)

### 3.2 Typography & Geometry
- **Qt Typography**: Global QSS declares `"Titillium Web", "Roboto", "Segoe UI", sans-serif`.
- **Arcade Typography**: Default Pyglet system TrueType font via `arcade.Text`, sized 9px–24px.
- **Corners & Geometry**:
  - Qt widgets: 4px–6px border radius (`border-radius: 4px` on buttons/edits, `6px` on groupboxes).
  - Arcade HUD widgets: Sharp-cornered flat rectangles (`arcade.XYWH`) with 2px solid outlines.

### 3.3 Style Inconsistencies (Current State vs. Intended Direction)
- **Current State (Fragmented)**:
  - *No shared theme module*: Styling is duplicated across 5 separate QSS strings and hardcoded inline RGB tuples.
  - *Varying background darks*: `tyre_strategy_window.py` uses `#0f0f0f` and `#111111`, whereas `pit_wall_window.py` uses `#15151e` and `#1f1f27`.
  - *Mixed text whites*: Random usage of `#ffffff`, `#f0f0f0`, `#e0e0e0`, `arcade.color.WHITE`, and `arcade.color.ANTI_FLASH_WHITE`.
- **Intended Direction**:
  - Extract all colors, fonts, and stylesheets into a single shared theme configuration (`src/gui/theme.py` or `src/lib/theme.py`) so both PySide6 stylesheets and Arcade RGB constants reference identical tokens.

---

## 4. Known Issues & Fragile Areas

1. **Duplicate Draw Call in `WeatherComponent` ([`src/ui_components.py:196`](file:///c:/Users/samik/OneDrive/Documenti/F1%20project/f1-race-replay/src/ui_components.py#L196) and [`src/ui_components.py:212-215`](file:///c:/Users/samik/OneDrive/Documenti/F1%20project/f1-race-replay/src/ui_components.py#L212-L215)):**
   - The "Weather" title text is drawn twice every frame: once at line 196 via an ad-hoc `arcade.Text(...).draw()`, and again at lines 212–215 via `self._text.draw()`.
2. **Duplicated QSS Stylesheet Strings Across Multiple Files:**
   - [`src/gui/pit_wall_window.py:6-116`](file:///c:/Users/samik/OneDrive/Documenti/F1%20project/f1-race-replay/src/gui/pit_wall_window.py#L6-L116)
   - [`src/gui/race_selection.py:41-126`](file:///c:/Users/samik/OneDrive/Documenti/F1%20project/f1-race-replay/src/gui/race_selection.py#L41-L126)
   - [`src/gui/insights_menu.py:11-77`](file:///c:/Users/samik/OneDrive/Documenti/F1%20project/f1-race-replay/src/gui/insights_menu.py#L11-L77)
   - [`src/gui/settings_dialog.py:25-60`](file:///c:/Users/samik/OneDrive/Documenti/F1%20project/f1-race-replay/src/gui/settings_dialog.py#L25-L60)
   - [`src/insights/telemetry_stream_viewer.py:13-123`](file:///c:/Users/samik/OneDrive/Documenti/F1%20project/f1-race-replay/src/insights/telemetry_stream_viewer.py#L13-L123)
   - *Risk*: Any CSS fix made to one dialog or window does not propagate to the others.
3. **`TelemetryStreamViewer` Inheritance Outlier ([`src/insights/telemetry_stream_viewer.py:125`](file:///c:/Users/samik/OneDrive/Documenti/F1%20project/f1-race-replay/src/insights/telemetry_stream_viewer.py#L125)):**
   - Subclasses `QMainWindow` directly rather than `PitWallWindow`. Manually connects its own `TelemetryStreamClient` and is launched as a standalone `subprocess.Popen` in [`src/gui/insights_menu.py:302`](file:///c:/Users/samik/OneDrive/Documenti/F1%20project/f1-race-replay/src/gui/insights_menu.py#L302) instead of an in-process window.
4. **Stale Tyre Strategy Cache & Subprocess Module Caching:**
   - If a saved `computed_data/tyre_state.json` exists from a later lap, launching a replay from Lap 1 can cause driver stints to freeze unless reset logic is triggered.
   - `InsightsMenu.launch_tyre_strategy` requires explicit `importlib.reload(tsw)` ([`src/gui/insights_menu.py:319`](file:///c:/Users/samik/OneDrive/Documenti/F1%20project/f1-race-replay/src/gui/insights_menu.py#L319)) because Python caches the module in `sys.modules`.
5. **Per-Frame Object Allocation in Render Loop:**
   - In [`src/ui_components.py`](file:///c:/Users/samik/OneDrive/Documenti/F1%20project/f1-race-replay/src/ui_components.py) and [`src/interfaces/race_replay.py`](file:///c:/Users/samik/OneDrive/Documenti/F1%20project/f1-race-replay/src/interfaces/race_replay.py), several components instantiate temporary `arcade.Text(...)` and `arcade.XYWH(...)` instances inside loops every frame rather than re-using cached layout objects, producing unnecessary GC overhead at high replay speeds.
6. **Layout Margin & Overlap Vulnerability:**
   - Screen bounds rely on fixed pixel margins (`left_ui_margin=340`, `right_ui_margin=260`).
   - Selected driver cards in `DriverInfoComponent` ([`src/ui_components.py:855-866`](file:///c:/Users/samik/OneDrive/Documenti/F1%20project/f1-race-replay/src/ui_components.py#L855-L866)) stack vertically (`height=210`, `gap=10`). Selecting 3 or more drivers on viewports ≤720p causes cards to drop below `min_top=220` and cease rendering or overlap the bottom progress bar.

---

## 5. How to Verify a GUI Change

### 5.1 Direct Command-Line Launches
Always run commands using the project's virtual environment:
- **Test Session Selector GUI**:
  ```cmd
  .\venv\Scripts\python.exe main.py
  ```
- **Test 2D Race Replay directly (skips selector)**:
  ```cmd
  .\venv\Scripts\python.exe main.py --year 2023 --round 1 --viewer
  ```
- **Test Replay without HUD overlays**:
  ```cmd
  .\venv\Scripts\python.exe main.py --year 2023 --round 1 --viewer --no-hud
  ```
- **Test 2D Qualifying Replay directly**:
  ```cmd
  .\venv\Scripts\python.exe main.py --year 2023 --round 1 --viewer --qualifying
  ```

### 5.2 Standalone Insight Window Tests
To isolate and debug individual Qt pit-wall tools without running the full race simulation:
```cmd
.\venv\Scripts\python.exe -m src.gui.insights_menu
.\venv\Scripts\python.exe -m src.insights.driver_telemetry_window
.\venv\Scripts\python.exe -m src.insights.lap_time_chart_window
.\venv\Scripts\python.exe -m src.insights.track_position_window
.\venv\Scripts\python.exe -m src.insights.race_control_feed_window
.\venv\Scripts\python.exe -m src.insights.ml_prediction_window
.\venv\Scripts\python.exe -m src.insights.telemetry_stream_viewer
```
*(Note: `tyre_strategy_window.py` lacks a `__main__` entrypoint; launch it via `python -c "import sys; from PySide6.QtWidgets import QApplication; from src.insights.tyre_strategy_window import TyreStrategyWindow; app = QApplication(sys.argv); w = TyreStrategyWindow(); w.show(); sys.exit(app.exec())"`).*

### 5.3 Programmatic Visual Capture & Verification
When verifying changes in headless or automated agent environments:
- **PySide6 Windows**: Grab window framebuffer directly to disk:
  ```python
  from PySide6.QtWidgets import QApplication
  # after window.show():
  pixmap = window.grab()
  pixmap.save("debug_screenshot.png")
  ```
- **Arcade OpenGL Window**: Capture current backbuffer after an update tick:
  ```python
  import arcade
  image = arcade.get_image()
  image.save("debug_arcade.png")
  ```

### 5.4 Visual Verification Checklist
1. **Overlap Check**: Verify weather panel, driver info cards, and bottom progress bar do not collide when window is resized.
2. **Double-Draw Check**: Ensure no text or button appears fuzzy/aliased due to duplicate draw calls (e.g. `WeatherComponent`).
3. **Resizing**: Resize the window to verify track auto-scaling and component position repositioning (`on_resize`).
4. **Socket Telemetry Sync**: When testing insight windows against a running race replay, confirm status bar turns green ("Status: Connected") and packet counter increments.

---

## 6. Open Questions & Unresolved Decisions

1. **Theme Consolidation Strategy**: Should a unified `src/gui/theme.py` be introduced to replace all duplicated inline `STYLE_SHEET` definitions and centralize Arcade RGB/RGBA tuples into shared constants?
2. **Subprocess vs. In-Process Insight Architecture**: Should `TelemetryStreamViewer` and `InsightsMenu` continue spawning as separate operating system processes via `subprocess.Popen`/`run`, or be integrated into a unified multi-window PySide6 application lifecycle?
3. **Multi-Driver Card Overflow**: How should `DriverInfoComponent` handle multiple selected drivers when vertical space is exhausted? (Current behavior stops rendering additional drivers; alternatives include horizontal card splitting or a scroll area).
4. **Tyre Strategy Persistence Scope**: `computed_data/tyre_state.json` does not currently tag data with season/round IDs. Should the state file be scoped per session (e.g. `computed_data/tyre_state_{year}_{round}_{session}.json`) to prevent cross-race stint corruption?
5. **Arcade Text Performance**: Should all dynamic `arcade.Text` instantiations inside `LeaderboardComponent.draw` and `DriverInfoComponent.draw` be refactored to pre-allocated object pools to prevent garbage collection hiccups at 32x+ playback speed?
