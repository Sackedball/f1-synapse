# Explanation: time.py

## High-Level Overview
`src/lib/time.py` provides time conversion and string parsing utilities for race timing. It standardizes conversions between raw floating-point seconds (e.g. `83.456`) and human-readable motorsport timing strings (e.g. `01:23.456`), and safely parses diverse FastF1 / Pandas timedelta string formats into numerical second floats.

---

## Dependencies

### Standard Library
- `re`: Regular expressions for splitting arbitrary time string delimiters (`[:.]`).
- `typing.Optional`: Type hints for nullable float outputs.

---

## Classes & Functions

### Functions

#### `format_time(seconds: float) -> str`
- **Purpose**: Converts seconds into standard `MM:SS.sss` lap time format.
- **Inputs**:
  - `seconds` (*float*): Cumulative seconds for a lap or interval.
- **Outputs**:
  - `str`: Formatted time string (e.g. `92.450` becomes `"01:32.450"`), or `"N/A"` if `None` or negative.

#### `parse_time_string(time_str: str) -> Optional[float]`
- **Purpose**: Robust parser converting varied motorsport timing strings and Pandas timedelta representations into total seconds as a `float`.
- **Inputs**:
  - `time_str` (*str*): Timestamp or timedelta representation, such as:
    - `"0 days 00:01:27.060000"` (Pandas Timedelta)
    - `"00:01:26:123000"` or `"00:01:26.123000"` (HH:MM:SS.micro)
    - `"01:26.123"` (MM:SS.sss)
    - `"01:26"` (MM:SS)
- **Outputs**:
  - `Optional[float]`: Total elapsed time in seconds rounded to 3 decimal places, or `None` if parsing fails.
- **Core Logic**:
  1. Strips `"days"` prefixes and trailing whitespace.
  2. Splits tokens on both `:` and `.`.
  3. Resolves 3-token ambiguities (distinguishes `HH:MM:SS` from `MM:SS.micro` by checking token character length).
  4. Pads microsecond fractions to 6 digits (`ljust(6, '0')`).
  5. Computes \(\text{seconds} = \text{hh} \times 3600 + \text{mm} \times 60 + \text{ss} + \frac{\text{micro}}{10^6}\).
