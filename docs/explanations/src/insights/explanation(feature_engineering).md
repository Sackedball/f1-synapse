# Explanation: `src/insights/feature_engineering.py`

## High-Level Overview
`src/insights/feature_engineering.py` provides high-performance, real-time mathematical, kinematic, and statistical feature extraction tools for live Formula 1 telemetry. It serves as the feature pipeline for downstream machine learning and predictive analytics models (such as overtake probability and pit stop detection in `MLPredictionWindow`). The module is strictly engineered for zero heap fragmentation and sub-millisecond execution, using online sliding-window statistical algorithms and kinematic motion equations.

---

## Dependencies

### Standard Library
- `math`: Mathematical primitives (`sqrt`).
- `collections.deque`: Double-ended queue used as a fixed-capacity ring buffer (`maxlen`).

### External Libraries
- `numpy`: Array and numerical manipulation primitives.

### Internal Modules
- None (designed as a self-contained, low-level mathematical utility).

---

## Classes & Functions

### `class SlidingWelford`
Implements an online, rolling-window statistical accumulator using **Welford's Algorithm** with sliding-window eviction. Computes mean, variance, and standard deviation in \(O(1)\) time without storing or re-summing large arrays.

- `__init__(self, maxlen: int)`:
  Initializes a fixed-length `deque(maxlen=maxlen)`, current running mean `self.mean = 0.0`, and sum of squared differences from the mean `self.m2 = 0.0`.
- `update(self, val: float)`:
  - If buffer is full, pops the oldest value (`val_old`) and computes the adjusted mean and \(M_2\) in \(O(1)\):
    $$\mu_{\text{prev}} = \mu$$
    $$\mu = \frac{\mu \cdot N - v_{\text{old}}}{N - 1}$$
    $$M_2 = M_2 - (v_{\text{old}} - \mu_{\text{prev}})(v_{\text{old}} - \mu)$$
  - Appends new value (`val_new`) and applies standard online Welford updates:
    $$\mu_{\text{prev}} = \mu$$
    $$\mu = \mu + \frac{v_{\text{new}} - \mu_{\text{prev}}}{N}$$
    $$M_2 = M_2 + (v_{\text{new}} - \mu_{\text{prev}})(v_{\text{new}} - \mu)$$
- `variance (property) -> float`:
  Returns sample variance $\frac{M_2}{N}$ (or `0.0` if $N \le 1$).
- `std_dev (property) -> float`:
  Returns standard deviation $\sqrt{\text{variance}}$.

### `class DriverTelemetryState`
Maintains short-term rolling telemetry history and computes behavioral driving aggression indices for a single driver over time.

- `__init__(self, driver_code: str, fps: float = 25.0, window_sec: float = 3.0)`:
  Calculates time delta $\Delta t = \frac{1}{\text{fps}}$ and maximum window length $N = \text{fps} \times \text{window\_sec}$ (e.g. 75 frames for 3 seconds at 25 Hz). Initializes `SlidingWelford` instances for throttle and brake signals, and tracks previous velocity/throttle values.
- `update(self, telemetry: dict)`:
  - Ingests raw `throttle`, `brake`, and `speed` values from the current frame.
  - Updates rolling mean and variance for throttle and braking inputs.
  - Computes **Throttle Jerk**:
    $$\text{Throttle Jerk} = \frac{\text{Throttle}_t - \text{Throttle}_{t-1}}{\Delta t}$$
  - Computes **Braking Severity**:
    $$\text{Deceleration} = \frac{\text{Speed}_t - \text{Speed}_{t-1}}{\Delta t}$$
    $$\text{Severity} = \text{Brake} \times |\text{Deceleration}| \quad (\text{if Deceleration} < 0 \text{ and Brake} > 0)$$
  - Stores states for the subsequent evaluation tick.

### `class KinematicEngine`
Static vector and spatial math engine that computes relational telemetry and battle metrics between two competing cars (the attacking chaser and the defending target).

- `calculate_battle_metrics(chaser: dict, target: dict, circuit_length: float) -> dict`:
  - **Euclidean Gap**: Direct 2D line-of-sight distance $\sqrt{\Delta x^2 + \Delta y^2}$.
  - **Along-Track Gap ($\Delta s$)**: Curvilinear distance along the circuit polyline accounting for circuit wrap-around:
    $$\Delta s = (s_{\text{target}} - s_{\text{chaser}}) \pmod{\text{CircuitLength}}$$
  - **Closing Velocity ($\Delta v$)**: Rate at which the chaser is catching the target:
    $$\Delta v = v_{\text{chaser}} - v_{\text{target}}$$
  - **Time-to-Collision (TTC)**: Estimated seconds until contact if current speeds persist:
    $$\text{TTC} = \frac{\Delta s}{\max(\Delta v, 0.01)} \quad (\text{if } \Delta v > 0, \text{ else } \infty)$$
  Returns a structured metrics dictionary.

---

## Core Logic

1. **Sliding-Window Welford Algorithm**:
   Traditional rolling statistics require summing a slice of $K$ elements, which takes $O(K)$ time and generates significant garbage collection overhead at 60 FPS. `SlidingWelford` updates the mean and second central moment in $O(1)$ constant time with exact floating-point stability upon each value entry and eviction.

2. **Aggression Indices (Driver Intent Detection)**:
   By tracking the first derivative of throttle ($\text{dThrottle}/\text{d}t$) and brake force coupled with deceleration magnitude, machine learning algorithms can classify whether a driver is casually managing tyres or aggressively lunging into a braking zone for an overtake.

3. **Curvilinear vs. Euclidean Spatial Gaps**:
   In complex chicane or hairpin sections, two cars might be only 10 meters apart in direct Euclidean space through a barrier, but 200 meters apart along the actual racing tarmac. `KinematicEngine` computes both metrics, using along-track distance $\Delta s \pmod L$ for accurate closing speed and overtake modeling.
