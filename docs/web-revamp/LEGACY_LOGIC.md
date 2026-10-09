# Legacy Logic Extraction

Extracted from `src/ui_components.py` and `src/insights/ml_prediction_window.py`.

## Leaderboard & Gap Logic
File: `src/ui_components.py`
Method: `LeaderboardComponent._calculate_gaps()` (approx. line 302)

The legacy app relies on cumulative distance (`dist`, stored as `progress_m` which is implicitly `dist * 10.0` in the backend) to correctly establish order and gaps, avoiding lap-wrapping issues.

```python
# Constants
# The legacy app uses a hardcoded reference speed of 200 km/h (55.56 m/s) to approximate time gaps from distance.
REFERENCE_SPEED_MPS = 55.56 

# Leader Gap
raw_to_leader = abs(leader_progress_val - progress_m)
dist_to_leader_m = raw_to_leader / 10.0
time_to_leader_s = dist_to_leader_m / REFERENCE_SPEED_MPS

# Neighbor Gap (Interval)
code_ahead, _, _, progress_ahead = entries[idx - 1]
raw = abs(progress_m - progress_ahead)
dist_m = raw / 10.0
time_s = dist_m / REFERENCE_SPEED_MPS
```

## DNF / PIT / OUT Logic
File: `src/ui_components.py`
Method: `LeaderboardComponent.draw()` (approx. line 391)

Flags for driver states are derived directly from the position payload:
```python
# OUT (DNF / Retirement)
is_out = pos.get("rel_dist", 0) == 1

# PIT
is_in_pit = bool(pos.get("in_pit"))
```
*Note: `rel_dist` equalling 1 seems to be a legacy convention for signaling a DNF state in the telemetry stream.*

## ML Feature Extraction
File: `src/insights/ml_prediction_window.py`
Methods: `_extract_overtake_features()`, fallback logic in `_calculate_heuristic_overtake()` (approx. lines 268-360)

```python
# 1. Feature Extraction (Target car vs Ahead car)
dist_t = target.get('dist', 0) * 10
dist_a = ahead.get('dist', 0) * 10
delta_s = abs(dist_a - dist_t) # Distance between cars in meters

delta_v = target.get('speed', 0) - ahead.get('speed', 0) # Speed difference

# Track position difference
euclidean_dist = math.hypot(ahead.get('x', 0) - target.get('x', 0), ahead.get('y', 0) - target.get('y', 0))

# DRS is considered active if the raw value is 10, 12, or 14
drs_active = 1.0 if target.get('drs', 0) in [10, 12, 14] else 0.0

mean_throttle = target.get('throttle', 0)
throttle_jerk = 0.0 # hardcoded simplification in legacy
mean_brake = target.get('brake', 0)

tyre_age_delta = target.get('tyre_life', 0) - ahead.get('tyre_life', 0)

# 2. Heuristic Fallback Logic (if model missing)
if delta_s > 50:
    prob = 0.05
else:
    prob = max(0.1, 1.0 - (delta_s / 50.0))
    
if delta_v > 0:
    prob *= (1.0 + min(delta_v / 20.0, 0.5))
else:
    prob *= 0.5
    
if drs_active == 1.0:
    prob *= 1.5
    
if tyre_age_delta < -5:
    prob *= 1.2
elif tyre_age_delta > 5:
    prob *= 0.8
```

File: `src/insights/ml_prediction_window.py`
Method: `_extract_pit_features()`

```python
# Pit feature mapping
tyre_compound_map = {'SOFT': 0, 'MEDIUM': 1, 'HARD': 2, 'INTERMEDIATE': 3, 'WET': 4}
tyre_compound = tyre_compound_map.get(compound_str, 1) # Default to Medium

sc_active = 1.0 if status == '4' else 0.0
vsc_active = 1.0 if status in ['6', '7'] else 0.0

# Crossover pace loss threshold for pit advantage
PACE_LOSS_THRESHOLD_S = 1.1 
```
