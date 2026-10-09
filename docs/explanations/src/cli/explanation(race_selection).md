# Explanation: race_selection.py (CLI)

## High-Level Overview
`src/cli/race_selection.py` provides an interactive terminal user interface (TUI) for launching Formula 1 replays directly from the command line without opening a desktop GUI window. It utilizes terminal prompts, styled spinners, and Markdown headers to guide the user through selecting a season year, Grand Prix round, session type, and HUD preference.

---

## Dependencies

### Standard Library
- `sys`, `os`: Path resolution for the main application script (`main.py`) and command-line argument propagation.
- `subprocess`: Executes the viewer process via `subprocess.run()`.

### External Libraries
- `questionary`: Terminal interactive prompt framework (`select`, `Choice`, `Style`).
- `rich.console.Console`: Terminal styling and colored output.
- `rich.markdown.Markdown`: Formats title headers.
- `rich.progress.Progress, SpinnerColumn, TextColumn`: Renders animated loading spinners while querying race weekend metadata.

### Internal Modules
- `src.f1_data.get_race_weekends_by_year`: Fetches calendar events and session formats for a chosen year.
- `src.lib.season.get_season`: Resolves current championship season as default.

---

## Classes & Functions

### Functions

#### `cli_load()`
- **Purpose**: Interactive CLI loop that prompts the user and spawns the 2D race replay viewer.
- **Workflow**:
  1. Displays title banner using Rich Markdown.
  2. **Year Selection**: Prompts the user to pick a year between 2010 and the current season.
  3. **Event Loading**: Displays an animated red spinner while fetching race weekend schedules from FastF1.
  4. **Round Selection**: Generates a menu of Grand Prix events formatted with dates.
  5. **Session Type Selection**: Dynamically inspects event format; if the weekend featured a Sprint format, adds `"Sprint Qualifying"` and `"Sprint"` options alongside `"Qualifying"` and `"Race"`.
  6. **HUD Preference**: Asks whether to render the in-game HUD overlay.
  7. **Execution**: Maps user answers into command-line arguments (e.g. `--year 2024 --round 3 --qualifying --no-hud`) and spawns `main.py --viewer` using `subprocess.run()`.
