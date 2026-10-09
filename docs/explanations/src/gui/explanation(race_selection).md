# Explanation: race_selection.py (GUI)

## High-Level Overview
`src/gui/race_selection.py` implements the primary graphical dashboard launcher for the F1 Race Replay application. Built using PySide6 (Qt for Python), it provides an F1 broadcast-themed window (`#15151e`, `#1f1f27`, `#e10600`) where users can filter Grand Prix seasons (from 2018 to the active season), filter by track location, inspect race calendar schedules in a tree view, check session availability against real-world UTC timestamps, and launch the 2D replay viewer.

It features asynchronous multithreaded fetching (`QThread`) and an inter-process readiness synchronization lock (`QProgressDialog` + `--ready-file` polling) that keeps the UI responsive during long FastF1 network calls.

---

## Dependencies

### Standard Library
- `sys`, `os`: Child process execution and filesystem path operations.
- `subprocess`: Detached subprocess execution (`subprocess.Popen`).
- `tempfile`, `uuid`: Generates unique temporary readiness lockfiles for inter-process synchronization.
- `datetime`, `timezone`: Validates whether scheduled sessions have already taken place in real-world UTC time.

### External Libraries
- `PySide6.QtWidgets`: `QMainWindow`, `QWidget`, `QVBoxLayout`, `QHBoxLayout`, `QLabel`, `QComboBox`, `QPushButton`, `QTreeWidget`, `QTreeWidgetItem`, `QMessageBox`, `QProgressDialog`.
- `PySide6.QtCore`: `QThread`, `Signal`, `Qt`, `QTimer`.

### Internal Modules
- `src.f1_data`: Schedule queries (`get_race_weekends_by_year`, `get_race_weekends_by_place`, `get_all_unique_race_names`), session loading (`load_session`), and cache management.
- `src.gui.settings_dialog.SettingsDialog`: Preferences modal dialog for cache paths.
- `src.lib.season.get_season`: Resolves current season year.

---

## Classes & Functions

### Worker Threads

#### `FetchScheduleWorker(QThread)`
- **Purpose**: Asynchronously downloads calendar events for a selected year from FastF1 in the background without freezing the GUI.
- **Signals**:
  - `result(object)`: Emits list of race weekend dictionaries.
  - `error(str)`: Emits error message string on failure.

### Main Window

#### `RaceSelectionWindow(QMainWindow)`
Primary desktop launcher interface.

- **UI Layout (`_setup_ui`)**:
  - **Header**: F1 Replay title and a Settings button (`⚙ Settings`) opening `SettingsDialog`.
  - **Filter Bars**:
    - Year selector combobox (`2018` to current season, plus `"All Years"`).
    - Circuit location combobox (`"All Races"` or specific Grand Prix name).
  - **Schedule Tree View (`QTreeWidget`)**: Displays columns `Round`, `Event`, `Country`, and `Start Date`.
  - **Session Panel (`QVBoxLayout`)**: Contextual right panel displaying buttons for available sessions (`Qualifying`, `Race`, `Sprint Qualifying`, `Sprint`).
- **Methods**:
  - **`load_schedule(year, events)`**: Clears tree and triggers background `FetchScheduleWorker`.
  - **`load_by_year(year_text)`**: Resets location filter and loads schedule for the chosen year.
  - **`load_by_place(race_name)`**: Filters calendar by specific Grand Prix venue across all seasons.
  - **`populate_schedule(events)`**: Populates `QTreeWidget` with event items and attaches event payload data to `Qt.UserRole`.
  - **`on_race_clicked(item, column)`**:
    Evaluates clicked Grand Prix:
    1. Checks if the event included a Sprint format.
    2. Compares session timestamps against `datetime.now(timezone.utc)` to determine if the session has concluded or is upcoming.
    3. Dynamically generates launch buttons for available sessions.
  - **`_on_session_button_clicked(ev, session_label)`**:
    Launches `main.py --viewer` in a decoupled subprocess:
    1. Shows a modal indeterminate progress dialog (`QProgressDialog`: "Loading session data...").
    2. Spawns an internal `FetchSessionWorker` thread to pre-load/cache session data via FastF1.
    3. Once loaded, generates a unique temporary token file path `ready_path` in `tempfile.gettempdir()`.
    4. Executes `subprocess.Popen([sys.executable, "main.py", "--viewer", ... , "--ready-file", ready_path])`.
    5. Starts a 200ms `QTimer` polling loop that checks for the creation of `ready_path` by the child Arcade window, closing the progress dialog when the replay canvas appears.
  - **`open_settings()`**: Displays modal `SettingsDialog`.
