# Explanation: bayesian_tyre_model.py

## High-Level Overview
`src/bayesian_tyre_model.py` implements a Bayesian State-Space Model with a 1D Kalman Filter and Theil-Sen robust linear regression to estimate unobservable tyre wear, true latent pace, and remaining tyre life across all Formula 1 compounds (Soft, Medium, Hard, Intermediate, Wet).

In racing telemetry, observable lap times are confounded: as tyres degrade (making the car slower), fuel burns off at ~1.6 kg/lap (making the car ~0.05s/lap faster). This model mathematically isolates the latent tyre degradation state \(\alpha_t\) from observable lap times \(y_t\) by accounting for fuel mass reduction, compound warmup curves, track surface abrasion factors, and weather/compound mismatch penalties (e.g. running slicks on a wet track).

---

## Dependencies

### Standard Library
- `dataclasses.dataclass`: Lightweight configuration containers (`TyreProfile`, `StateSpaceConfig`).
- `enum.Enum`: Strongly typed categorical definitions (`TyreCategory`, `TrackCondition`).
- `typing.Dict, Optional, Tuple`: Explicit type hints.

### External Libraries
- `numpy`: Numerical filtering, array clipping, variance calculations, and standard deviations.
- `pandas`: Filtering, sorting, and indexing telemetry and stint lap records.
- `scipy.stats`: Robust Theil-Sen estimator (`stats.theilslopes`) for slope extraction resilient to traffic outliers, yellow flags, and pit stops.

---

## Mathematical Formulation

### State Equation (System Dynamics)
\[
\alpha_{t+1} = (1 - I_{\text{pit}}) \cdot (\alpha_t + \nu \cdot A_{\text{track}}) + I_{\text{pit}} \cdot \alpha_{\text{reset}} + \eta_t, \quad \eta_t \sim \mathcal{N}(0, \sigma_\eta^2)
\]
Where:
- \(\alpha_t\): Latent tyre pace capability (true lap time in seconds without fuel weight).
- \(\nu\): Compound-specific baseline degradation rate (s/lap).
- \(A_{\text{track}}\): Dimensionless circuit abrasion multiplier (typically 0.7 to 1.4).
- \(I_{\text{pit}}\): Pit stop indicator (triggers reset to base pace \(\alpha_{\text{reset}}\)).
- \(\eta_t\): Process noise (\(\sigma_\eta = 0.1\,\text{s}\)).

### Observation Equation (Measurement)
\[
y_t = \alpha_t + \gamma \cdot \text{FuelMass}_t + \delta_{\text{mismatch}} + \varepsilon_t, \quad \varepsilon_t \sim \mathcal{N}(0, \sigma_\varepsilon^2)
\]
Where:
- \(y_t\): Actual observed lap time.
- \(\gamma\): Fuel penalty coefficient (\(\sim 0.032\,\text{s/kg}\)).
- \(\delta_{\text{mismatch}}\): Penalty imposed when tyre category conflicts with track conditions (e.g., +8.0s for slicks in wet).
- \(\varepsilon_t\): Measurement noise (\(\sigma_\varepsilon = 0.3\,\text{s}\)).

---

## Classes & Data Structures

### `TyreCategory(Enum)` & `TrackCondition(Enum)`
- Enumerates tyre groupings (`SLICK`, `INTER`, `WET`) and track states (`DRY`, `DAMP`, `WET`).

### `TyreProfile` (Dataclass)
- Holds physical parameters for each compound:
  - `name`: Compound name (e.g. `'SOFT'`, `'HARD'`).
  - `category`: Category enum.
  - `degradation_rate`: Nominal wear rate in seconds per lap.
  - `reset_pace`: Benchmark lap time on fresh rubber.
  - `warmup_laps`: Number of introductory laps before optimal operating temperature is reached.
  - `max_analysis_laps`: Cap on laps analyzed for slope estimation.
  - `max_degradation`: Total pace loss (in seconds) defining 0% tyre life.

### `StateSpaceConfig` (Dataclass)
- Hyperparameters for Kalman filtering:
  - `sigma_epsilon = 0.3`, `sigma_eta = 0.1`.
  - `fuel_effect_prior = 0.032` s/kg, `starting_fuel = 110.0` kg, `fuel_burn_rate = 1.6` kg/lap.
  - `mismatch_penalties`: Lookup dictionary mapping `(TyreCategory, TrackCondition)` pairs to seconds-per-lap pace penalties.

### `BayesianTyreDegradationModel`
Main state-space estimator class.

#### Methods:
- **`__init__(config)`**: Initializes tyre profiles, noise parameters, and abrasion baselines.
- **`estimate_track_abrasion(laps_df) -> float`**:
  Calculates circuit-specific abrasion index \(A_{\text{track}}\). Extracts all dry slick stints \(\ge 8\) laps, removes fuel effect, fits Theil-Sen slopes, and takes the median ratio against compound baselines. Clamped between `0.7` and `1.4`.
- **`fit(laps_df, driver=None)`**:
  Cleans and prepares lap data, estimates track abrasion, updates compound wear priors using historical empirical stint slopes, and computes latent state sequences.
- **`_prepare_data(laps_df) -> pd.DataFrame`**:
  Filters out in/out laps, laps \(\le 1\), and invalid lap times. Computes fuel mass per lap.
- **`_estimate_parameters(laps_df)`**:
  Applies Theil-Sen regression to warmup-filtered stint laps and Bayesian updates each compound's degradation prior with observed median slope.
- **`_compute_latent_states(laps_df)`**:
  Executes the 1D recursive Kalman Filter across every lap of each driver:
  1. Computes a priori state prediction \(\mu_{\text{pred}}\) and variance \(P_{\text{pred}}\).
  2. Calculates innovation \(v = y_t - \hat{y}_t\).
  3. Computes Kalman Gain \(K = P_{\text{pred}} / (P_{\text{pred}} + \sigma_\varepsilon^2)\).
  4. Updates state estimate and posterior uncertainty.
- **`predict_next_lap(driver, current_lap, laps_df, track_condition=None) -> Tuple[float, float, Dict]`**:
  Forecasts the driver's next lap time, standard deviation, remaining tyre health (0–100%), and 95% confidence intervals.
- **`get_health(...) -> Dict`**:
  Returns consumer-friendly tyre telemetry metrics for GUI widgets, including tyre wear percentage, expected degradation delta, and track abrasion rating.
