# Explanation: main.py

## High-Level Overview
`main.py` is the primary entry point and orchestrator for the Formula 1 Race Replay application. It coordinates session selection (via CLI or GUI), data loading via FastF1 wrappers, session routing (Qualifying vs. Race/Sprint), layout initialization, and launching the 2D Arcade replay window alongside the PySide6 telemetry insights menu.

Depending on CLI flags passed, it can:
- Launch the interactive PySide6 graphical session selector (`RaceSelectionWindow`).
- Launch an interactive command-line selector (`cli_load`).
- Directly launch the Arcade replay engine in viewer mode (`--viewer`) for specific years, rounds, and session types (`R`, `S`, `Q`, `SQ`).
- Query and print available championship rounds or sprints (`--list-rounds`, `--list-sprints`).

---

## Dependencies

### Standard Library
- `sys`: Command-line arguments processing (`sys.argv`) and process exit handling (`sys.exit`).
- `logging`: Configures log levels, specifically suppressing verbose FastF1 logger output unless `--verbose` is provided.

### External Libraries
- `PySide6.QtWidgets.QApplication`: Initializes the Qt application event loop for the GUI launcher.
- `PySide6.QtGui.QIcon`: Sets the window icon for the Qt application using the F1 logo.

### Internal Modules
- `src.f1_data`: Provides session loading (`load_session`), telemetry processing (`get_race_telemetry`, `get_quali_telemetry`), FastF1 cache activation (`enable_cache`), track rotation (`get_circuit_rotation`), and round listings (`list_rounds`, `list_sprints`).
- `src.run_session`: Executes the 2D race replay loop (`run_arcade_replay`) and launches the insights menu daemon/process (`launch_insights_menu`).
- `src.interfaces.qualifying`: Runs the qualifying leaderboard and lap time visualization (`run_qualifying_replay`).
- `src.cli.race_selection`: Handles terminal-based interactive selection (`cli_load`).
- `src.gui.race_selection`: Provides the main GUI launcher window (`RaceSelectionWindow`).
- `src.lib.season`: Resolves default or current championship season year (`get_season`).

---

## Classes & Functions

### Functions

#### `main(year=None, round_number=None, playback_speed=1, session_type='R', visible_hud=True, ready_file=None, show_telemetry_viewer=True)`
- **Purpose**: Core orchestration function for loading a chosen session and starting either a Qualifying viewer or a full 2D Race/Sprint replay.
- **Inputs**:
  - `year` (*int*): Championship season year (e.g., 2024, 2026).
  - `round_number` (*int*): Calendar round number.
  - `playback_speed` (*float/int*): Playback speed multiplier (default: `1`).
  - `session_type` (*str*): Type of session (`'R'` for Race, `'S'` for Sprint, `'Q'` for Qualifying, `'SQ'` for Sprint Qualifying).
  - `visible_hud` (*bool*): Whether the in-game HUD overlay (leaderboard, telemetry cards, session banners) is visible.
  - `ready_file` (*str | None*): Path to an IPC synchronization lockfile used by the GUI to detect when replay loading has completed.
  - `show_telemetry_viewer` (*bool*): Flag controlling telemetry insights menu integration.
- **Outputs**: None (launches the Arcade window loop and blocks until closed).
- **Behavior**:
  1. Loads session metadata via `load_session()`.
  2. Ensures FastF1 caching is enabled.
  3. If session type is `'Q'` or `'SQ'`, extracts qualifying lap time telemetry via `get_quali_telemetry()` and runs `run_qualifying_replay()`.
  4. If session type is `'R'` or `'S'`:
     - Extracts interpolated per-frame telemetry via `get_race_telemetry()`.
     - Attempts to retrieve qualifying telemetry for exact track boundary DRS zones; falls back to fastest race lap if unavailable.
     - Resolves track geometry rotation angle via `get_circuit_rotation()`.
     - Compiles metadata dictionary `session_info` for the top banner.
     - Spawns the telemetry insights menu (`launch_insights_menu()`).
     - Launches `run_arcade_replay()` with telemetry streaming enabled.

---

## Core Logic & CLI Arguments

When invoked directly (`if __name__ == "__main__":`), `main.py` parses command-line arguments:
- **`--verbose`**: If absent, suppresses FastF1 internal logging (`logging.CRITICAL`).
- **`--cli`**: Routes directly to the terminal-driven interactive menu (`cli_load()`).
- **`--list-rounds` / `--list-sprints`**: Prints calendar schedules for the specified season and exits.
- **`--viewer`**: Direct headless/CLI launch into the replay viewer without opening the Qt selection dialog. Accepts:
  - `--year <YYYY>`: Specifies target season.
  - `--round <N>`: Specifies championship round number.
  - `--sprint-qualifying`, `--sprint`, `--qualifying`: Sets session type to `SQ`, `S`, or `Q` (defaults to `R`).
  - `--no-hud`: Hides on-screen dashboard HUD.
  - `--ready-file <path>`: Writes signal token for GUI synchronizer.
- **Default (No Arguments)**: Instantiates the Qt application (`QApplication`), sets the Formula 1 logo icon, presents the modern dark-themed `RaceSelectionWindow`, and enters the Qt GUI event loop.
