# Explanation: season.py

## High-Level Overview
`src/lib/season.py` is a lightweight utility that dynamically determines the active or most relevant Formula 1 championship season year based on the current calendar date.

---

## Dependencies

### Standard Library
- `datetime.datetime`: Queries current local system date and time (`date.now()`).

---

## Classes & Functions

### Functions

#### `get_season() -> int`
- **Purpose**: Returns the most appropriate championship season year for default UI selection.
- **Inputs**: None.
- **Outputs**:
  - `int`: 4-digit calendar year (e.g. `2024`, `2026`).
- **Core Logic**:
  Checks the current month. Since new Formula 1 seasons officially commence testing and racing around late February / March, if the current month is February or later (`month >= 2`), it returns the current calendar year. If it is January (`month < 2`), it defaults to the previous year (`year - 1`) because the new championship has not yet begun.
