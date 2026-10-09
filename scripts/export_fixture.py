import os
import json
import sys
# Add parent dir to path so we can import src
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from src.f1_data import load_session, get_race_telemetry, get_driver_colors, enable_cache
import fastf1

def export_golden_fixture():
    # Setup
    enable_cache()
    
    year = 2024
    round_idx = 4 # Suzuka was round 4 in 2024
    session_type = 'R'
    
    print("Loading Suzuka session data (using 2024 data as placeholder for 2026)...")
    session = load_session(year, round_idx, session_type)
    telemetry_data = get_race_telemetry(session, session_type)
    frames = telemetry_data['frames']
    driver_colors = get_driver_colors(session)
    
    # We also need track geometry - the legacy app uses ui_components.build_track_from_example_lap
    from src.ui_components import build_track_from_example_lap
    # find an example lap
    example_lap = session.laps.pick_fastest().get_telemetry()
    track_geometry = build_track_from_example_lap(example_lap)
    
    fixture_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'web', 'fixtures', 'suzuka-2026-r3'))
    os.makedirs(fixture_dir, exist_ok=True)
    
    # Export Drivers
    results = session.results
    drivers = []
    for _, res in results.iterrows():
        code = res['Abbreviation']
        color = driver_colors.get(code, (255, 255, 255))
        drivers.append({
            "code": code,
            "number": int(res['DriverNumber']) if str(res['DriverNumber']).isdigit() else 0,
            "fullName": res['FullName'],
            "team": res['TeamName'],
            "color": f"#{color[0]:02x}{color[1]:02x}{color[2]:02x}"
        })

    
    with open(os.path.join(fixture_dir, 'drivers.json'), 'w') as f:
        json.dump(drivers, f, indent=2)
        
    # Export Track Geometry
    track_geom = {
        "centerline": [[float(x), float(y)] for x, y in zip(track_geometry[0], track_geometry[1])],
        "inner": [[float(x), float(y)] for x, y in zip(track_geometry[2], track_geometry[3])],
        "outer": [[float(x), float(y)] for x, y in zip(track_geometry[4], track_geometry[5])],
        "bounds": {
            "minX": float(track_geometry[6]), "maxX": float(track_geometry[7]),
            "minY": float(track_geometry[8]), "maxY": float(track_geometry[9])
        },
        "rotationDeg": 0,
        "finishIndex": 0, # approx
        "drsZones": [{"start": int(z['start']['index']), "end": int(z['end']['index'])} for z in track_geometry[10]],
        "sectors": [],
        "lengthM": 5807 # Suzuka approximate length
    }
    with open(os.path.join(fixture_dir, 'track.json'), 'w') as f:
        json.dump(track_geom, f, indent=2)
        
    # Export Frames (first 120s = 120 * 25 = 3000 frames)
    frames_export = frames[:3000]
    
    with open(os.path.join(fixture_dir, 'frames_120s.json'), 'w') as f:
        json.dump(frames_export, f)

    print(f"Exported fixture to {fixture_dir}")

if __name__ == "__main__":
    export_golden_fixture()
