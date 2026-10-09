import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { FrameStore } from '../FrameStore';
import { parseChunk } from '../binary';
import { createSnapshot } from '../snapshot';

describe('engine performance and allocation test', () => {
  const chunk0Buf = fs.readFileSync(
    path.resolve(__dirname, '../../../fixtures/suzuka-2026-r3/chunk_0.bin'),
  );
  const arrayBuffer0 = chunk0Buf.buffer.slice(
    chunk0Buf.byteOffset,
    chunk0Buf.byteOffset + chunk0Buf.byteLength,
  );
  const chunk0 = parseChunk(arrayBuffer0);

  it('runs 10,000 sample() calls with 0 allocations and < 0.05 ms/call', () => {
    const store = new FrameStore({
      sid: 'suzuka-2026-r3',
      totalFrames: 3000,
      fps: 25,
      chunkSize: 1500,
    });
    store.setChunk(0, chunk0);

    const snapshot = createSnapshot(20);

    // Instrument constructor allocations
    let allocations = 0;
    const OriginalFloat32 = globalThis.Float32Array;
    const OriginalUint8 = globalThis.Uint8Array;
    const OriginalInt8 = globalThis.Int8Array;
    const OriginalInt16 = globalThis.Int16Array;
    const OriginalArray = globalThis.Array;

    // Warmup JIT (1,000 runs)
    for (let i = 0; i < 1000; i++) {
      store.sample((i % 1400) / 25, snapshot);
    }

    // Hook TypedArray constructors to catch any hidden allocation
    try {
      // @ts-expect-error test interceptor
      globalThis.Float32Array = class extends OriginalFloat32 {
        constructor(...args: unknown[]) {
          allocations++;
          // @ts-expect-error test interceptor
          super(...(args as ConstructorParameters<typeof OriginalFloat32>));
        }
      };

      const start = performance.now();
      const ITERATIONS = 10000;

      for (let i = 0; i < ITERATIONS; i++) {
        // Vary t to exercise interpolation and indexing across frames
        const t = (i % 1400) / 25;
        store.sample(t, snapshot);
      }

      const totalMs = performance.now() - start;
      const msPerCall = totalMs / ITERATIONS;

      // Assertions
      expect(allocations).toBe(0);
      expect(msPerCall).toBeLessThan(0.05); // Must average < 0.05 ms per call

      console.log(
        `Engine benchmark: ${ITERATIONS} samples in ${totalMs.toFixed(2)} ms (${(
          msPerCall * 1000
        ).toFixed(2)} µs/call). Allocations: ${allocations}`,
      );
    } finally {
      globalThis.Float32Array = OriginalFloat32;
      globalThis.Uint8Array = OriginalUint8;
      globalThis.Int8Array = OriginalInt8;
      globalThis.Int16Array = OriginalInt16;
      globalThis.Array = OriginalArray;
    }
  });
});
