# Explanation: `src/insights/ml_prediction_window.py`

## High-Level Overview
`src/insights/ml_prediction_window.py` provides a real-time machine learning inference interface for the Pit Wall suite. Subclassing `PitWallWindow`, it ingests the live telemetry stream at 25–60 Hz, computes high-dimensional spatial, control, and degradation features on the fly, and outputs sub-5ms probabilistic predictions for:
1. **Overtake Probability**: The likelihood of a position change between an attacking chaser and a defending car over the subsequent 5–10 seconds.
2. **Pit Stop Anticipation**: The probability that a driver will box at the end of the current lap, factoring in Bayesian tyre degradation curves and Safety Car deployment opportunities.

---

## Dependencies

### Standard Library
- `os`: Paths and file existence verification for serialized models (`models/overtake_lgbm.joblib`).
- `time`: Microsecond performance benchmarking via `time.perf_counter()`.
- `collections.deque`: Ring buffers storing 3-second rolling telemetry slices.
- `typing`: Type annotations (`Dict`, `List`, `Optional`, `Tuple`).

### External Libraries
- `joblib`: Deserializes offline-trained Scikit-Learn / LightGBM gradient boosted decision tree models.
- `numpy`: Fast vectorized math, exponential decay functions, and logistic sigmoid activations.
- `pandas`: Structured single-row DataFrames formatted to match model feature signatures.
- `PySide6.QtCore`: Core Qt enums (`Qt.AlignCenter`).
- `PySide6.QtGui`: Custom 2D GUI painting tools (`QPainter`, `QColor`, `QFont`, `QLinearGradient`, `QBrush`).
- `PySide6.QtWidgets`: UI presentation elements (`QApplication`, `QWidget`, `QVBoxLayout`, `QHBoxLayout`, `QGridLayout`, `QGroupBox`, `QFrame`, `QLabel`, `QComboBox`, `QCheckBox`).

### Internal Modules
- `src.gui.pit_wall_window.PitWallWindow`: Base window architecture handling socket connections, threads, and status reporting.
- `src.bayesian_tyre_model.BayesianTyreDegradationModel`: Compound-specific non-linear tyre wear profiles.
- `src.lib.tyres.get_tyre_compound_str`: Translates integer compound IDs (0, 1, 2) to string names ("SOFT", "MEDIUM", "HARD").

---

## Classes & Functions

### `class MetricGauge(QWidget)`
A custom high-performance, double-buffered probability progress gauge widget.

- `__init__(self, title: str, parent=None)`:
  Initializes title, stores value normalized in $[0.0, 1.0]$, and sets minimum height (64px).
- `set_value(self, val: float)`:
  Clamps input to $[0.0, 1.0]$ and triggers immediate Qt repaint (`self.update()`).
- `paintEvent(self, event)`:
  Renders using `QPainter` with antialiasing:
  - Draws dark `#15151e` background and `#111111` recessed progress track.
  - Draws dynamic linear gradient bar:
    - $< 40\%$: Green (`#2ECC71` to `#27AE60`).
    - $40\% - 70\%$: Amber (`#F39C12` to `#D35400`).
    - $> 70\%$: Red (`#E74C3C` to `#C0392B`).
  - Overlays bold title and formatted percentage text (`"XX.X%"`).

### `class MLPredictionWindow(PitWallWindow)`
Main predictive intelligence dashboard window.

- `__init__(self)`:
  - Defines temporal window parameters: `FPS = 25.0`, `BUFFER_SEC = 3.0`, `RING_SIZE = 75` frames.
  - Initializes `_driver_history` mapping driver codes to rolling deques.
  - Loads models via `_load_models()`.
  - Configures window geometry (920x560) and title.
- `_load_models(self)`:
  Attempts to load `models/overtake_lgbm.joblib` using `joblib.load()`. Initializes `BayesianTyreDegradationModel`. If model weights are missing, sets models to `None` and activates mathematical heuristic fallbacks.
- `setup_ui(self)`:
  Constructs dashboard layout:
  - Top Control Card:
    - `auto_track_cb`: Checkbox toggling "Auto-Track Lead Battle (P2 vs P1)".
    - `attacker_combo` & `defender_combo`: Dropdowns for manually selecting competing cars.
  - Panel 1: **Overtake Probability Engine**:
    - `ot_battle_label`: Displays "Battle: CHASER chasing TARGET".
    - `ot_gauge`: Visual `MetricGauge` showing position change probability.
    - `ot_metrics_label`: Monospace line showing track gap (m), closing velocity $\Delta v$ (km/h), and DRS status.
    - `ot_alert_badge`: Status badge ("MONITORING BATTLE", "ATTACK DEVELOPING", "OVERTAKE IMMINENT").
  - Panel 2: **Pit Stop Anticipation Engine**:
    - `pit_gauge`: `MetricGauge` showing probability of pitting on the current lap.
    - `pit_metrics_label`: Displays tyre age, compound, and Safety Car trigger status.
    - `pit_alert_badge`: Status badge ("STINT EXTENDING", "WINDOW OPEN", "BOX THIS LAP").
  - Bottom Status Banner: Displays real-time inference latency benchmark in milliseconds.
- `_sync_driver_combos(self, driver_codes: List[str])`:
  Maintains dropdown selection states smoothly across live frames without resetting user choices.
- `on_telemetry_data(self, data: dict)`:
  Core real-time ingestion loop executed on every incoming frame:
  - Appends incoming throttle, brake, speed, and timestamp to circular ring buffers.
  - Identifies race leader (P1) and 2nd place (P2) based on live positions.
  - If `auto_track_cb` is checked, automatically sets attacker to P2 and defender to P1.
  - Extracts overtake features and calls `_infer_overtake()`.
  - Extracts pit features and calls `_infer_pit()`.
  - Updates gauges, labels, and badges.
  - Computes inference latency using `time.perf_counter()` and displays execution time in status footer.
- `_extract_overtake_features(self, att: dict, dfnd: dict, att_code: str) -> tuple`:
  Computes spatial delta along track ($\Delta s = \Delta \text{frac} \times \text{CircuitLength}$), closing velocity ($\Delta v = v_{\text{att}} - v_{\text{dfnd}}$), Euclidean line-of-sight distance, binary DRS activation, 3-second mean throttle, throttle jerk ($\text{dThrottle}/\text{d}t$), mean brake, and tyre age delta.
- `_extract_pit_features(self, att: dict, track_status: str) -> tuple`:
  Extracts tyre life (laps on current set), tyre compound, binary Safety Car status (`track_status == '4'`), VSC status, and current race lap number.
- `_infer_overtake(self, X: pd.DataFrame) -> float`:
  Executes `overtake_model.predict_proba(X)[0][1]`. If model is unavailable, runs analytical fallback:
  - If $\Delta s > 40\text{m}$, probability is clamped to $1\%$.
  - If $\Delta s < -1.0\text{m}$ (attacker already ahead), probability is $99\%$.
  - Multiplicative kinematic decay:
    $$P = e^{-\Delta s / 15.0} \times \left(\frac{\max(0, \Delta v)}{20.0} + 0.4 \times \text{DRS}\right)$$
- `_infer_pit(self, X: pd.DataFrame) -> float`:
  Evaluates pace degradation using Bayesian compound wear profiles ($\text{PaceLoss} = \text{TyreLife} \times \text{DegradationRate}$). Maps pace loss through a logistic sigmoid S-curve:
  $$P_{\text{base}} = \frac{1}{1 + e^{-5.0 \times (\text{PaceLoss} - 1.1)}}$$
  Adds $+45\%$ boost if a Safety Car is deployed (`sc_active == 1.0`), reflecting the reduced time lost during pit stops under neutralization ("cheap pit stop").
- `_update_overtake_badge(self, prob: float)` / `_update_pit_badge(self, prob: float)`:
  Updates text labels and background colors (Green, Gold, Crimson) based on threshold boundaries.

### Global Functions
- `main()`:
  Standalone launcher that initializes `QApplication` and executes `MLPredictionWindow`.

---

## Core Logic

1. **Sub-5ms Inference Pipeline**:
   Live race streams arrive at up to 60 FPS (every 16ms). Heavy neural networks or disk I/O would cause frame drops and desynchronize the dashboard. `MLPredictionWindow` keeps feature extraction purely in memory with fixed-capacity ring buffers (`deque(maxlen=75)`) and uses lightweight LightGBM trees or analytical sigmoid kinematics, achieving ~1.5–3.0 ms total latency per tick.

2. **Automated Lead Battle Tracking**:
   The `auto_track_cb` toggle continuously checks the top two positions on the circuit (P1 and P2). When a lead change occurs, the window dynamically updates the attacker and defender targets without manual user intervention, ensuring continuous monitoring of the most critical battle on track.

3. **Bayesian Tyre Wear with Safety Car Opportunism**:
   Pit strategy in Formula 1 is strongly non-linear: tyres degrade gradually until hitting a steep "cliff" (modeled via the logistic S-curve centered at 1.1s pace loss). When a Safety Car is deployed, pit lane delta drops from ~22s to ~11s relative to cars circulating at delta speed; the model injects an immediate $+45\%$ step probability increase to reflect this pit window opening.
