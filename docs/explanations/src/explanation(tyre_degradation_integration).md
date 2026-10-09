# Explanation: tyre_degradation_integration.py

## High-Level Overview
`src/tyre_degradation_integration.py` bridges the mathematical state-space model (`BayesianTyreDegradationModel`) with the real-time 2D Arcade replay renderer and HUD widgets. It provides caching, frame-level querying, and visual formatting utilities (such as dynamic RGB color interpolation for health progress bars and string formatters for telemetry cards).

---

## Dependencies

### Standard Library
- `typing.Optional, Dict`: Type annotations for dictionaries and optional parameters.

### External Libraries
- `pandas`: Reads and validates historical lap dataframes (`session.laps`).

### Internal Modules
- `src.bayesian_tyre_model.BayesianTyreDegradationModel`: Underlying statistical engine computing latent pace and tyre wear.

---

## Classes & Functions

### Classes

#### `TyreDegradationIntegrator`
- **Purpose**: Lifecycle manager and query caching facade for tyre degradation estimation during live playback.
- **Attributes**:
  - `session`: FastF1 session object.
  - `_laps_df`: Cached reference to session laps.
  - `_model`: Instantiated `BayesianTyreDegradationModel`.
  - `_initialized` (*bool*): Tracks whether model fitting has occurred.
  - `_cache` (*dict*): In-memory cache mapping `"{driver}_{lap}_{track_condition}"` to previous model outputs.
- **Methods**:
  - **`initialize_from_session() -> bool`**:
    Validates presence of lap telemetry, fits the Bayesian state-space model across all session laps, and logs fitted compound degradation rates.
  - **`is_initialized() -> bool`**: Returns initialization status.
  - **`get_tyre_health(driver_code, current_lap, track_condition=None, force_refresh=False) -> dict | None`**:
    Retrieves health metrics for a specific driver and lap from cache, or evaluates the underlying Bayesian model and caches the result.
  - **`get_health_for_frame(driver_code, frame_data, frame_index=None) -> dict | None`**:
    Extracts the driver's current lap number and track condition directly from an Arcade replay frame dictionary and queries `get_tyre_health()`.
  - **`clear_cache()`**: Resets in-memory cached computations.

### Helper Functions

#### `format_tyre_health_bar(health: int, width: int = 100, height: int = 12) -> Dict`
- **Purpose**: Calculates visual bar dimensions and smoothly interpolates RGB color from Green (100% health) to Yellow (50%) to Red (0%).
- **Inputs**:
  - `health` (*int*): Tyre health percentage (0–100).
  - `width`, `height` (*int*): Visual dimensions in pixels.
- **Outputs**:
  - `dict`: Contains `width`, `height`, `fill_width`, `color` `(R, G, B)`, and clamped `health`.

#### `format_degradation_text(health_data: Dict) -> str`
- **Purpose**: Formats a compact telemetry string for UI telemetry cards.
- **Inputs**:
  - `health_data` (*dict*): Dictionary output from `get_tyre_health()`.
- **Outputs**:
  - `str`: Formatted string, e.g. `"SOFT (L14): 68% • +1.2s (±0.25s)"`.
