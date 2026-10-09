import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { FrameStore } from '@/engine/FrameStore';
import { parseChunk } from '@/engine/binary';
import { createSnapshot } from '@/engine/snapshot';
import { Camera } from '../camera';

describe('AC2: Car order along track visually and mathematically agrees with position', () => {
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

  const store = new FrameStore({
    sid: 'suzuka-2026-r3',
    totalFrames: 3000,
    fps: 25,
    chunkSize: 1500,
  });
  store.setChunk(0, chunk0);
  store.setChunk(1, chunk1);

  const camera = new Camera(1920, 1080);
  const snapshot = createSnapshot(20);

  const sampleTimes = [5, 15, 30, 60, 90]; // 5 sampled times

  sampleTimes.forEach((t) => {
    it(`verifies car order agrees with position at t=${t}s`, () => {
      store.sample(t, snapshot);

      const n = snapshot.n;
      expect(n).toBe(20);

      // Verify that orderByPosition produces strictly monotonic position order (0, 1, 2, ..., n-1)
      for (let p = 0; p < n - 1; p++) {
        const leadDriverIdx = snapshot.orderByPosition[p];
        const nextDriverIdx = snapshot.orderByPosition[p + 1];

        const leadPos = snapshot.position[leadDriverIdx];
        const nextPos = snapshot.position[nextDriverIdx];

        expect(leadPos).toBeLessThanOrEqual(nextPos);

        // Leader must have >= cumulative distance than next car
        const leadDist = snapshot.dist[leadDriverIdx];
        const nextDist = snapshot.dist[nextDriverIdx];
        expect(leadDist).toBeGreaterThanOrEqual(nextDist);

        // Gap ahead of next car should be non-negative
        const gap = snapshot.gapAhead[nextDriverIdx];
        if (!isNaN(gap)) {
          expect(gap).toBeGreaterThanOrEqual(0);
        }

        // Verify valid projected screen coordinates for both
        const leadScreen = camera.worldToScreen(snapshot.x[leadDriverIdx], snapshot.y[leadDriverIdx]);
        const nextScreen = camera.worldToScreen(snapshot.x[nextDriverIdx], snapshot.y[nextDriverIdx]);

        expect(Number.isFinite(leadScreen.x)).toBe(true);
        expect(Number.isFinite(leadScreen.y)).toBe(true);
        expect(Number.isFinite(nextScreen.x)).toBe(true);
        expect(Number.isFinite(nextScreen.y)).toBe(true);
      }
    });
  });
});
