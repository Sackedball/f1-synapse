# Explanation: tyres.py

## High-Level Overview
`src/lib/tyres.py` defines bidirectional mappings between Formula 1 tyre compound names (Soft, Medium, Hard, Intermediate, Wet) and compact integer identifiers. This enables memory-efficient serialization in NumPy arrays and fast transmission over TCP telemetry streams.

---

## Dependencies
None (pure Python).

---

## Classes & Functions

### Constants

- **`tyre_compounds_ints`** (*dict*):
  Dictionary mapping compound string labels to integer IDs:
  - `"SOFT"` \(\to 0\)
  - `"MEDIUM"` \(\to 1\)
  - `"HARD"` \(\to 2\)
  - `"INTERMEDIATE"` \(\to 3\)
  - `"WET"` \(\to 4\)

### Functions

#### `get_tyre_compound_int(compound_str: str) -> int`
- **Purpose**: Converts a compound name string to its integer ID.
- **Inputs**:
  - `compound_str` (*str*): Compound label (case-insensitive, e.g. `"Soft"`, `"medium"`, `"HARD"`).
- **Outputs**:
  - `int`: Corresponding integer (`0` to `4`), or `-1` if unrecognized.

#### `get_tyre_compound_str(compound_int: int) -> str`
- **Purpose**: Performs reverse lookup from integer ID to uppercase compound label.
- **Inputs**:
  - `compound_int` (*int*): Compound identifier integer.
- **Outputs**:
  - `str`: Uppercase name string (e.g. `"SOFT"`, `"MEDIUM"`), or `"UNKNOWN"` if unrecognized.
