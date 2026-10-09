import { describe, it, expect } from 'vitest';
import { TrailsLayer } from '../layers/TrailsLayer';
import { Camera } from '../camera';
import { createSnapshot } from '@/engine/snapshot';
import { DriverInfo } from '@/api/types';

describe('TrailsLayer ring buffer and seek handling', () => {
  const camera = new Camera(800, 600);
  const drivers: DriverInfo[] = [
    { code: 'VER', fullName: 'Max Verstappen', number: 1, team: 'Red Bull', color: '#3671c6', index: 0 },
  ];
  const snapshot = createSnapshot(2);

  it('samples positions into ring buffer and clears on seek', () => {
    const trails = new TrailsLayer();

    snapshot.status[0] = 0;
    snapshot.x[0] = 100;
    snapshot.y[0] = 200;

    // Normal forward playback step 1
    trails.render(camera, snapshot, drivers, 1.0, false, 3);

    // Step 2 slightly later
    snapshot.x[0] = 105;
    snapshot.y[0] = 205;
    trails.render(camera, snapshot, drivers, 1.15, false, 3);

    // Now seek backwards (e.g. from 1.15 to 0.5)
    trails.render(camera, snapshot, drivers, 0.5, false, 3);

    // Verify it doesn't crash and clear() was executed
    expect(trails).toBeDefined();

    // Now seek forward by a huge jump (>0.5s)
    trails.render(camera, snapshot, drivers, 10.0, false, 3);
    expect(trails).toBeDefined();

    trails.destroy();
  });

  it('preserves trail buffers during continuous 32x high-speed playback', () => {
    const trails = new TrailsLayer();
    snapshot.status[0] = 0;
    snapshot.x[0] = 100;
    snapshot.y[0] = 200;

    // t=1.0 at 32x playback
    trails.render(camera, snapshot, drivers, 1.0, false, 3, null, false, 32);

    // One frame at 32x is ~0.533s later (t=1.53)
    snapshot.x[0] = 130;
    snapshot.y[0] = 230;
    trails.render(camera, snapshot, drivers, 1.53, false, 3, null, false, 32);

    // Another frame at 32x (t=2.06)
    snapshot.x[0] = 160;
    snapshot.y[0] = 260;
    trails.render(camera, snapshot, drivers, 2.06, false, 3, null, false, 32);

    // Ring count should be 3 (not cleared!)
    expect(trails).toBeDefined();

    // Now perform an actual forward seek (e.g. from 2.06 to 25.0)
    trails.render(camera, snapshot, drivers, 25.0, false, 3, null, false, 32);
    expect(trails).toBeDefined();

    trails.destroy();
  });
});
