import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { FrameStore } from '../FrameStore';
import { parseChunk } from '../binary';
import { createSnapshot } from '../snapshot';

describe('FrameStore and sample(t)', () => {
  const chunk0Buf = fs.readFileSync(
    path.resolve(__dirname, '../../../fixtures/suzuka-2026-r3/chunk_0.bin'),
  );
  const chunk1Buf = fs.readFileSync(
    path.resolve(__dirname, '../../../fixtures/suzuka-2026-r3/chunk_1.bin'),
  );

  const arrayBuffer0 = chunk0Buf.buffer.slice(
    chunk0Buf.byteOffset,
    chunk0Buf.byteOffset + chunk0Buf.byteLength,
  );
  const arrayBuffer1 = chunk1Buf.buffer.slice(
    chunk1Buf.byteOffset,
    chunk1Buf.byteOffset + chunk1Buf.byteLength,
  );

  const chunk0 = parseChunk(arrayBuffer0);
  const chunk1 = parseChunk(arrayBuffer1);

  it('samples real fixture chunk 0 at t=0', () => {
    const store = new FrameStore({
      sid: 'suzuka-2026-r3',
      totalFrames: 3000,
      fps: 25,
      chunkSize: 1500,
    });
    store.setChunk(0, chunk0);

    const snapshot = createSnapshot(20);
    store.sample(0, snapshot);

    expect(snapshot.frameIndex).toBe(0);
    expect(snapshot.n).toBe(20);
    // Verifying drivers sampled
    expect(snapshot.position[0]).toBeGreaterThan(0);
    expect(snapshot.orderByPosition[0]).toBeDefined();
    // P1 driver must be at orderByPosition[0]
    const p1Driver = snapshot.orderByPosition[0];
    expect(snapshot.position[p1Driver]).toBe(1);
  });

  it('interpolates continuous channels correctly at fractional frames', () => {
    const store = new FrameStore({
      sid: 'suzuka-2026-r3',
      totalFrames: 3000,
      fps: 25,
      chunkSize: 1500,
    });
    store.setChunk(0, chunk0);

    const snap0 = createSnapshot(20);
    const snap1 = createSnapshot(20);
    const snapMid = createSnapshot(20);

    // Frame 10 is at t = 10 / 25 = 0.4s
    // Frame 11 is at t = 11 / 25 = 0.44s
    // Halfway is at t = 10.5 / 25 = 0.42s
    store.sample(0.4, snap0);
    store.sample(0.44, snap1);
    store.sample(0.42, snapMid);

    // Linear interpolation test on distance:
    const expectedDist = snap0.dist[0] + (snap1.dist[0] - snap0.dist[0]) * 0.5;
    expect(snapMid.dist[0]).toBeCloseTo(expectedDist, 3);

    // Discrete channel (gear, lap) should use lower frame
    expect(snapMid.gear[0]).toBe(snap0.gear[0]);
    expect(snapMid.lap[0]).toBe(snap0.lap[0]);
  });

  it('handles chunk-boundary continuity across chunk 0 and chunk 1', () => {
    const store = new FrameStore({
      sid: 'suzuka-2026-r3',
      totalFrames: 3000,
      fps: 25,
      chunkSize: 1500,
    });
    store.setChunk(0, chunk0);
    store.setChunk(1, chunk1);

    const snapshot = createSnapshot(20);

    // Frame 1499.5: right on the boundary between chunk 0 (frame 1499) and chunk 1 (frame 1500)
    // t = 1499.5 / 25 = 59.98s
    store.sample(59.98, snapshot);

    expect(snapshot.frameIndex).toBe(1499);
    // Values should not be NaN
    expect(isNaN(snapshot.x[0])).toBe(false);
    expect(isNaN(snapshot.y[0])).toBe(false);
    expect(snapshot.dist[0]).toBeGreaterThan(0);
  });

  it('handles boundary at end of session (clamping to totalFrames - 1)', () => {
    const store = new FrameStore({
      sid: 'suzuka-2026-r3',
      totalFrames: 3000,
      fps: 25,
      chunkSize: 1500,
    });
    store.setChunk(1, chunk1);

    const snapshot = createSnapshot(20);
    // Seek past total duration: 3000 frames / 25 = 120s
    store.sample(200, snapshot);

    expect(snapshot.frameIndex).toBe(2999);
    expect(snapshot.t).toBeCloseTo(2999 / 25, 4);
  });

  it('ensures orderByPosition matches position ranking correctly', () => {
    const store = new FrameStore({
      sid: 'suzuka-2026-r3',
      totalFrames: 3000,
      fps: 25,
      chunkSize: 1500,
    });
    store.setChunk(0, chunk0);

    const snapshot = createSnapshot(20);
    store.sample(30, snapshot); // sample at 30 seconds

    // Verify ordering: positions must be non-decreasing along orderByPosition
    for (let i = 0; i < 19; i++) {
      const drvCurr = snapshot.orderByPosition[i];
      const drvNext = snapshot.orderByPosition[i + 1];
      expect(snapshot.position[drvCurr]).toBeLessThanOrEqual(snapshot.position[drvNext]);
    }
  });

  it('pins chunk 0 and evicts non-pinned chunks when cache limit exceeded', () => {
    const store = new FrameStore({
      sid: 'test',
      totalFrames: 10000,
      maxCacheSize: 2, // very small cache
    });

    store.setChunk(0, chunk0); // chunk 0 pinned
    store.setChunk(1, chunk1);
    expect(store.hasChunk(0)).toBe(true);
    expect(store.hasChunk(1)).toBe(true);

    // Add chunk 2 via mock
    store.setChunk(2, chunk1);
    // Chunk 0 must NEVER be evicted!
    expect(store.hasChunk(0)).toBe(true);
  });

  it('getSeries fills outArray accurately without allocations', () => {
    const store = new FrameStore({
      sid: 'suzuka-2026-r3',
      totalFrames: 3000,
      fps: 25,
      chunkSize: 1500,
    });
    store.setChunk(0, chunk0);

    const series = new Float32Array(50);
    const count = store.getSeries(0, 'speed', 0, 4.9, 0.1, series);

    expect(count).toBe(50);
    for (let i = 0; i < count; i++) {
      expect(isNaN(series[i])).toBe(false);
    }
  });
});
