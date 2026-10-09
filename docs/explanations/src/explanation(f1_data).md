# Explanation: f1_data.py

## High-Level Overview
`src/f1_data.py` is the data engineering and ingestion engine of the F1 Race Replay application. It communicates directly with the `fastf1` API to extract raw telemetry, lap times, weather observations, race control flag statuses, and circuit geometry.

Because Formula 1 cars generate asynchronous, non-uniform time-series streams with variable sensor frequencies, `f1_data.py` normalizes, interpolates, and serializes this data into a uniform temporal grid (with a fixed time step \(\Delta t = 0.05\,\text{s}\) or 20 Hz). It also contains a kinematic physics simulation engine that synthesizes realistic GPS tracks and pit-entry behaviors for the official FIA Safety Car (which does not provide public GPS telemetry). Processed telemetry is cached to disk in `computed_data/` to eliminate network load on subsequent replays.

---

## Dependencies

### Standard Library
- `os`, `sys`, `math`, `pickle`, `gc`: File I/O, cache directory management, mathematical safety operations, object serialization (`.pkl`), and manual garbage collection.
- `multiprocessing.Pool`, `multiprocessing.cpu_count`: Parallelizes driver telemetry extraction across multiple CPU cores without GUI freezing.

### External Libraries
- `numpy`: Vectorized math, linear interpolation (`np.interp`), Euclidean distance computations, array concatenation, and sorting.
- `pandas`: Dataframe handling for laps, weather series, and race control logs.
- `fastf1`: Official public telemetry and timing wrapper for Formula 1 data.
- `scipy.spatial.cKDTree`: High-speed Spatial KD-Tree used for geometric lookups and nearest-point track projection.

### Internal Modules
- `src.lib.tyres`: Maps tyre compound strings (Soft, Medium, Hard, Intermediate, Wet) to integer codes.
- `src.lib.settings`: Manages cache paths and user settings.

---

## Classes & Functions

### Core Processing Functions

#### `_process_single_driver(args) -> dict | None`
- **Purpose**: Top-level worker function executed across multiprocessing workers to process all laps and telemetry for a single driver.
- **Inputs**:
  - `args` (*tuple*): `(year, round_number, session_type, driver_no, driver_code)`.
- **Outputs**:
  - `dict`: Normalized driver arrays (`t`, `x`, `y`, `dist`, `rel_dist`, `lap`, `tyre`, `tyre_life`, `speed`, `gear`, `drs`, `throttle`, `brake`), bounds `t_min`, `t_max`, and `max_lap`.
- **Core Logic**:
  Iterates over each lap, retrieves high-frequency car telemetry (`lap.get_telemetry()`), calculates cumulative race distance across lap transitions, and concatenates the arrays.

#### `get_race_telemetry(session, session_type="R") -> dict`
- **Purpose**: Coordinates full race data acquisition, temporal resampling, pit window alignment, and disk caching.
- **Inputs**:
  - `session`: FastF1 loaded session instance.
  - `session_type` (*str*): Session identifier (`'R'` or `'S'`).
- **Outputs**:
  - `dict`: Contains `frames` (list of timestamped world states), `track_statuses`, `total_laps`, `driver_colors`, and `race_control_messages`.
- **Core Logic**:
  1. Checks for local cached `.pkl` file in `computed_data/`. Returns immediately if cache exists.
  2. Spawns multiprocessing pool (capped at 4 workers to prevent Windows WinError 1450 resource exhaustion).
  3. Establishes the global timeline \(t_{\min}\) to \(t_{\max}\) at \(\Delta t = 0.05\,\text{s}\).
  4. Resamples all driver signals onto this uniform timeline using `np.interp`.
  5. Determines pit-stop intervals for each car and offsets them to align with spatial pit entry/exit.
  6. Compiles per-frame snapshots including sorted driver positions, relative gaps, speed, gear, DRS status, and synchronized weather data (track temp, air temp, rain status).
  7. Invokes `_compute_safety_car_positions()`.
  8. Serializes output to `computed_data/{event}_{session}_telemetry.pkl`.

#### `_compute_safety_car_positions(frames, track_statuses, session)`
- **Purpose**: Mathematically models and injects the Safety Car trajectory into every replay frame during track status `"4"`.
- **Core Logic & State Machine**:
  - **Phase 1: Deploying**: SC emerges from the pit lane, smoothly accelerating along the track to cruise at 80% of race pace until the pack catches up.
  - **Phase 2: On Track**: SC leads the field at an offset ahead of the leader. Handles lapped cars by allowing them to pass before the restart (e.g. Abu Dhabi 2021).
  - **Phase 3: Returning**: Once the Safety Car period terminates, the SC accelerates away from the field and smoothly interpolates off the track polyline and into the pit entry lane with an alpha fade out.

#### `get_quali_telemetry(session, session_type="Q") -> dict`
- **Purpose**: Extracts qualifying session rankings, segment eliminations (Q1, Q2, Q3 / SQ1, SQ2, SQ3), best lap times, tyre compounds, and sector splits.

#### `_process_quali_driver(args) -> dict | None`
- **Purpose**: Multiprocessing worker for processing qualifying driver sector times and lap telemetry.

### Utility & Query Functions

- **`enable_cache()`**: Activates FastF1 disk caching using the directory configured in `settings.py`.
- **`load_session(year, round_number, session_type="R")`**: Fetches session object from FastF1 with telemetry and weather enabled.
- **`get_driver_colors(session) -> dict`**: Retrieves team hex colors from FastF1 and converts them to RGB integer tuples `(R, G, B)`.
- **`get_circuit_rotation(session) -> float`**: Returns official circuit layout rotation angle in degrees.
- **`list_rounds(year)` / `list_sprints(year)`**: Queries and prints calendar event dates, names, and formats for a given year.
- **`get_all_unique_race_names(start_year, end_year) -> list[str]`**: Scans seasons across a year span and returns sorted unique Grand Prix names.
