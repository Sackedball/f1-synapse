# Explanation: settings.py

## High-Level Overview
`src/lib/settings.py` provides cross-platform configuration persistence for the F1 Race Replay application. Implemented via the Singleton design pattern, it ensures that all application components (FastF1 cache, data processors, and settings dialogs) access a synchronized configuration state stored in the user's OS application data directory (`%APPDATA%/F1RaceReplay/settings.json` on Windows or `~/.config/f1-race-replay/settings.json` on Linux/macOS).

---

## Dependencies

### Standard Library
- `json`: Serializes and deserializes the configuration file.
- `os`: Detects operating system (`os.name == "nt"`) and retrieves system environment paths (`APPDATA`).
- `pathlib.Path`: Object-oriented path handling and directory creation.
- `typing.Any, Optional`: Type annotations.

---

## Classes & Functions

### Classes

#### `SettingsManager`
Singleton class managing application configuration.

- **Class Attributes**:
  - `DEFAULTS`: Dictionary defining fallback paths:
    - `"cache_location"`: `".fastf1-cache"`
    - `"computed_data_location"`: `"computed_data"`
  - `_instance`: Singleton instance pointer.
- **Methods**:
  - **`__new__(cls) -> SettingsManager`**: Implements the Singleton pattern.
  - **`__init__()`**: Resolves configuration file location and loads JSON settings into memory.
  - **`_get_settings_file_path() -> Path`**: Determines the OS-appropriate path (`%APPDATA%/F1RaceReplay/settings.json` on Windows; `~/.config/f1-race-replay/settings.json` on Unix) and ensures parent directories exist.
  - **`load() -> None`**: Loads JSON from disk, merging values over default configurations.
  - **`save() -> None`**: Serializes in-memory configuration dictionary to disk with pretty formatting (`indent=2`).
  - **`get(key: str, default: Any = None) -> Any`**: Fetches a setting value by key, falling back to specified default or `DEFAULTS`.
  - **`set(key: str, value: Any) -> None`**: Sets a key-value pair in memory.
  - **`reset_to_defaults() -> None`**: Reverts configuration to default values and commits to disk.
- **Properties**:
  - `cache_location`: Getter/setter for the FastF1 cache directory path.
  - `computed_data_location`: Getter/setter for the processed telemetry pickle directory.

### Functions

#### `get_settings() -> SettingsManager`
- Convenience factory function returning the global `SettingsManager` singleton instance.
