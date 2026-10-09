# Explanation: settings_dialog.py

## High-Level Overview
`src/gui/settings_dialog.py` provides a modal configuration dialog (`SettingsDialog`) that allows users to inspect and customize local cache folders and pre-computed telemetry storage locations via an intuitive Qt GUI with native OS directory pickers.

---

## Dependencies

### Standard Library
None.

### External Libraries
- `PySide6.QtCore.Qt`: Window modality and alignment flags.
- `PySide6.QtWidgets`: `QDialog`, `QDialogButtonBox`, `QFileDialog`, `QFormLayout`, `QGroupBox`, `QHBoxLayout`, `QLabel`, `QLineEdit`, `QMessageBox`, `QPushButton`, `QVBoxLayout`.

### Internal Modules
- `src.lib.settings.get_settings`: Retrieves the application configuration singleton (`SettingsManager`).

---

## Classes & Functions

### `SettingsDialog(QDialog)`
Modal settings management window.

- **UI Layout (`_setup_ui`)**:
  - Styled with the application's dark F1 theme palette (`#15151e`, `#2c2c34`, `#e10600`).
  - **FastF1 Cache Location**: Text edit box and `"Browse..."` button opening native OS folder picker (`QFileDialog.getExistingDirectory`). Stores downloaded FastF1 raw API responses.
  - **Computed Data Location**: Text edit box and `"Browse..."` button for processed telemetry `.pkl` and cache files.
  - **Reset to Defaults**: Confirmation prompt restoring default paths (`.fastf1-cache` and `computed_data`).
  - **Dialog Button Box**: Standard `Save` and `Cancel` buttons.
- **Methods**:
  - **`_load_current_settings()`**: Populates text fields from the `SettingsManager` singleton.
  - **`_browse_cache_location()`**: Opens folder picker to select a new FastF1 cache directory.
  - **`_browse_computed_location()`**: Opens folder picker to select a new computed telemetry directory.
  - **`_reset_to_defaults()`**: Prompts user with `QMessageBox.question` before invoking `settings.reset_to_defaults()`.
  - **`_save_settings()`**: Validates that paths are non-empty, updates the `SettingsManager` properties, commits changes to JSON on disk (`settings.save()`), displays confirmation, and closes the dialog.
