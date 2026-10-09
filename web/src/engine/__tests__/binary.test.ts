import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { parseChunk } from '../binary';

describe('binary chunk decoder (F1SC)', () => {
  const fixturePath = path.resolve(__dirname, '../../../fixtures/suzuka-2026-r3/chunk_0.bin');

  it('parses real fixture chunk_0.bin correctly', () => {
    const fileBuf = fs.readFileSync(fixturePath);
    // Convert Buffer to ArrayBuffer
    const arrayBuffer = fileBuf.buffer.slice(
      fileBuf.byteOffset,
      fileBuf.byteOffset + fileBuf.byteLength,
    );

    const chunk = parseChunk(arrayBuffer);

    expect(chunk.header.v).toBe(1);
    expect(chunk.header.i0).toBe(0);
    expect(chunk.header.n).toBe(1500);
    expect(chunk.header.fps).toBe(25);
    expect(chunk.header.drivers).toHaveLength(20);
    expect(chunk.header.drivers[0]).toBe('VER');

    // Check per-driver channels
    expect(chunk.perDriver.x).toHaveLength(20);
    expect(chunk.perDriver.x[0]).toBeInstanceOf(Float32Array);
    expect(chunk.perDriver.x[0].length).toBe(1500);

    expect(chunk.perDriver.speed[0]).toBeInstanceOf(Float32Array);
    expect(chunk.perDriver.gear[0]).toBeInstanceOf(Int8Array);
    expect(chunk.perDriver.drs[0]).toBeInstanceOf(Uint8Array);
    expect(chunk.perDriver.lap[0]).toBeInstanceOf(Int16Array);
    expect(chunk.perDriver.position[0]).toBeInstanceOf(Uint8Array);

    // Check global channels
    expect(chunk.global.trackStatus).toBeInstanceOf(Uint8Array);
    expect(chunk.global.trackStatus.length).toBe(1500);
    expect(chunk.global.scX).toBeInstanceOf(Float32Array);
  });

  it('parses chunk_1.bin and verifies frame continuity', () => {
    const chunk1Path = path.resolve(__dirname, '../../../fixtures/suzuka-2026-r3/chunk_1.bin');
    const fileBuf = fs.readFileSync(chunk1Path);
    const arrayBuffer = fileBuf.buffer.slice(
      fileBuf.byteOffset,
      fileBuf.byteOffset + fileBuf.byteLength,
    );

    const chunk1 = parseChunk(arrayBuffer);
    expect(chunk1.header.i0).toBe(1500);
    expect(chunk1.header.n).toBe(1500);
    expect(chunk1.i1).toBe(3000);
  });

  it('throws descriptive error on invalid magic bytes', () => {
    const invalidBuf = new ArrayBuffer(32);
    expect(() => parseChunk(invalidBuf)).toThrow("Invalid magic bytes: expected 'F1SC'");
  });

  it('throws error when buffer is too small', () => {
    const tinyBuf = new ArrayBuffer(4);
    expect(() => parseChunk(tinyBuf)).toThrow('Chunk buffer too small');
  });
});
