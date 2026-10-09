# Codebase Documentation Index

This directory contains technical documentation for all Python modules in the Formula 1 Race Replay application. Each file details the module's high-level architectural purpose, dependencies, class/function APIs, inputs, outputs, and underlying mathematical/kinematic core logic.

---

## Directory Structure & Modules

### 1. Root & Training Scripts
- [`explanation(main).md`](explanation(main).md): Application entry point, CLI/GUI dispatch, argument parsing, FastF1 session bootstrap, and IPC handshake.
- [`scripts/explanation(train_ml_models).md`](scripts/explanation(train_ml_models).md): Offline training pipeline extracting historical telemetry and training LightGBM overtake prediction models.

### 2. Core Simulation & Data Pipelines (`src/`)
- [`src/explanation(run_session).md`](src/explanation(run_session).md): Central session runner orchestrating telemetry sampling, cache loading, and launching Qualifying/Race Replay windows.
- [`src/explanation(f1_data).md`](src/explanation(f1_data).md): FastF1 data ingestion, position/speed spline resampling, and pickled session persistence.
- [`src/explanation(bayesian_tyre_model).md`](src/explanation(bayesian_tyre_model).md): Bayesian probabilistic tyre degradation modeling using conjugate priors (Normal-Gamma distributions).
- [`src/explanation(tyre_degradation_integration).md`](src/explanation(tyre_degradation_integration).md): Polynomial & Bayesian degradation curve fitting and real-time wear prediction integration.
- [`src/explanation(ui_components).md`](src/explanation(ui_components).md): Arcade 2D visual widgets (circuit polyline builders, leaderboards, weather boxes, media controls).

### 3. User Interfaces & Menus (`src/cli/` & `src/gui/`)
- [`src/cli/explanation(race_selection).md`](src/cli/explanation(race_selection).md): Terminal interactive selection interface built with InquirerPy for season, round, and session picking.
- [`src/gui/explanation(race_selection).md`](src/gui/explanation(race_selection).md): PySide6 graphical calendar selector with circuit cards and session mode selection.
- [`src/gui/explanation(insights_menu).md`](src/gui/explanation(insights_menu).md): F1-themed launcher hub and window manager for all secondary telemetry analysis tools.
- [`src/gui/explanation(pit_wall_window).md`](src/gui/explanation(pit_wall_window).md): Base `QMainWindow` telemetry subscriber handling background TCP threads and Qt signals.
- [`src/gui/explanation(pit_wall_window_template).md`](src/gui/explanation(pit_wall_window_template).md): Boilerplate starter template for building new real-time insight tools.
- [`src/gui/explanation(settings_dialog).md`](src/gui/explanation(settings_dialog).md): Persistent settings modal managing cache paths, playback rates, and display preferences.

### 4. 2D Arcade Replay Interfaces (`src/interfaces/`)
- [`src/interfaces/explanation(qualifying).md`](src/interfaces/explanation(qualifying).md): 2D Qualifying session replay featuring distance-based speed, gear, throttle, and brake telemetry comparison against pole position.
- [`src/interfaces/explanation(race_replay).md`](src/interfaces/explanation(race_replay).md): 2D Grand Prix race replay engine with KD-Tree track projection, car markers, safety cars, and TCP broadcast server.

### 5. Pit Wall Insight Tools (`src/insights/`)
- [`src/insights/explanation(feature_engineering).md`](src/insights/explanation(feature_engineering).md): $O(1)$ Sliding-window Welford statistics, driver aggression indices, and closing velocity kinematics.
- [`src/insights/explanation(driver_telemetry_window).md`](src/insights/explanation(driver_telemetry_window).md): Live 3-panel strip charts (Speed, Gear, Throttle/Brake) with 30-second rolling and lap-distance modes.
- [`src/insights/explanation(lap_time_chart_window).md`](src/insights/explanation(lap_time_chart_window).md): Interactive PyQtGraph/Matplotlib lap time consistency, gap evolution, safety car shading, and pit stop annotations.
- [`src/insights/explanation(ml_prediction_window).md`](src/insights/explanation(ml_prediction_window).md): Real-time overtake and pit stop probability inference engine with auto-tracking P1/P2 battles.
- [`src/insights/explanation(race_control_feed_window).md`](src/insights/explanation(race_control_feed_window).md): Live scrolling FIA race control message feed with flag color accents and deduplication.
- [`src/insights/explanation(telemetry_stream_viewer).md`](src/insights/explanation(telemetry_stream_viewer).md): Raw JSON network stream inspector and diagnostic logging console.
- [`src/insights/explanation(track_position_window).md`](src/insights/explanation(track_position_window).md): Real-time 2D circuit radar with toggleable Real Track layout and Circular Schematic views.
- [`src/insights/explanation(tyre_strategy_window).md`](src/insights/explanation(tyre_strategy_window).md): Live horizontal stint timeline showing compound changes, lap counters, and position badges.
- [`src/insights/explanation(example_pit_wall_window).md`](src/insights/explanation(example_pit_wall_window).md): Reference proof-of-concept demonstrating telemetry packet ingestion.

### 6. Services & Utilities (`src/services/` & `src/lib/`)
- [`src/services/explanation(stream).md`](src/services/explanation(stream).md): High-performance TCP socket streaming architecture (`TelemetryStreamServer` and `TelemetryStreamClient`).
- [`src/lib/explanation(season).md`](src/lib/explanation(season).md): F1 season calendar, round schedules, and Grand Prix metadata loader.
- [`src/lib/explanation(settings).md`](src/lib/explanation(settings).md): INI file persistence manager with default configuration fallbacks.
- [`src/lib/explanation(time).md`](src/lib/explanation(time).md): Millisecond timing conversions, digital stopwatches, and F1 time delta string formatting.
- [`src/lib/explanation(tyres).md`](src/lib/explanation(tyres).md): Pirelli tyre compound encodings, compound aliases, and visual hex color mapping.
