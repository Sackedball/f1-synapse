# F1 Synapse — Golden Test Fixtures

This directory contains golden fixture datasets for offline unit testing, integration testing, and frontend development without FastF1 or network dependencies.

## Fixture: `suzuka-2026-r3`
- **Session:** 2026 Japanese Grand Prix (Suzuka Circuit), Round 3, Race (`2026_3_R`)
- **Format:** Strict adherence to `REF_API_CONTRACT.md v1.0`

### Files:
1. `drivers.json`: List of 22 drivers participating in the session, including code, number, fullName, team, broadcast color (`#rrggbb`), and column index.
2. `track.json`: Headless track geometry (centerline, inner ribbon edge, outer ribbon edge, bounds, rotationDeg, finishIndex, drsZones, lengthM).
3. `frames_120s.json`: 3,000 frames (120.0 seconds at 25 fps) covering the race start and opening lap battles and incidents (including Ricciardo and Albon terminal retirements).
4. `laps.json`: All recorded lap times, sector 1/2/3 splits, tyre compound, tyre life, pit in/out flags, personal best (PB) and fastest lap indicators.
5. `stints.json`: Full-race tyre stint breakdown per driver (stint number, compound, start lap, end lap).
6. `weather.json`: Low-rate weather timeline with air temperature, track temperature, humidity, wind speed/direction, and rainfall flag.
7. `race_control.json`: Full-race timeline of race control messages, flag statuses, and safety car deployments.
