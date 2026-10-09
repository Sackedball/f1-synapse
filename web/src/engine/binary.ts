/**
 * Binary chunk decoder for F1SC format (application/octet-stream).
 * Spec:
 * offset 0: 4 bytes magic "F1SC"
 * offset 4: u32 headerLen
 * offset 8: headerLen bytes UTF-8 JSON header
 * then: data blocks (each block start aligned to 4 bytes)
 */

export interface ChannelMeta {
  name: string;
  dtype: 'f32' | 'i8' | 'u8' | 'i16' | string;
}

export interface ChunkHeader {
  v: number;
  i0: number;
  n: number;
  fps: number;
  drivers: string[];
  perDriver: ChannelMeta[];
  global: ChannelMeta[];
}

export type PerDriverData = {
  x: Float32Array[];
  y: Float32Array[];
  dist: Float32Array[];
  speed: Float32Array[];
  throttle: Float32Array[];
  brake: Float32Array[];
  gear: Int8Array[];
  drs: Uint8Array[];
  lap: Int16Array[];
  tyre: Uint8Array[];
  tyreLife: Uint8Array[];
  position: Uint8Array[];
  inPit: Uint8Array[];
  status: Uint8Array[];
  gapAhead: Float32Array[];
  gapLeader: Float32Array[];
  [key: string]: (Float32Array | Int8Array | Uint8Array | Int16Array)[];
};

export type GlobalData = {
  trackStatus: Uint8Array;
  scX: Float32Array;
  scY: Float32Array;
  scPhase: Uint8Array;
  [key: string]: Float32Array | Uint8Array | Int16Array | Int8Array;
};

export interface ParsedChunk {
  header: ChunkHeader;
  i0: number;
  i1: number;
  n: number;
  fps: number;
  drivers: string[];
  perDriver: PerDriverData;
  global: GlobalData;
}

/**
 * Creates typed array view over an ArrayBuffer respecting byte offset and alignment.
 */
function createTypedView(
  dtype: string,
  buffer: ArrayBuffer,
  offset: number,
  count: number,
): Float32Array | Int8Array | Uint8Array | Int16Array {
  switch (dtype) {
    case 'f32':
      if (offset % 4 === 0) {
        return new Float32Array(buffer, offset, count);
      }
      return new Float32Array(buffer.slice(offset, offset + count * 4));
    case 'i8':
      return new Int8Array(buffer, offset, count);
    case 'u8':
      return new Uint8Array(buffer, offset, count);
    case 'i16':
      if (offset % 2 === 0) {
        return new Int16Array(buffer, offset, count);
      }
      return new Int16Array(buffer.slice(offset, offset + count * 2));
    default:
      throw new Error(`Unsupported dtype in chunk: ${dtype}`);
  }
}

function getItemSize(dtype: string): number {
  switch (dtype) {
    case 'f32':
      return 4;
    case 'i16':
      return 2;
    case 'i8':
    case 'u8':
      return 1;
    default:
      return 1;
  }
}

export function parseChunk(buffer: ArrayBuffer): ParsedChunk {
  if (buffer.byteLength < 8) {
    throw new Error('Chunk buffer too small: minimum 8 bytes required');
  }

  const dataView = new DataView(buffer);
  const magic = String.fromCharCode(
    dataView.getUint8(0),
    dataView.getUint8(1),
    dataView.getUint8(2),
    dataView.getUint8(3),
  );

  if (magic !== 'F1SC') {
    throw new Error(`Invalid magic bytes: expected 'F1SC', got '${magic}'`);
  }

  const headerLen = dataView.getUint32(4, true); // little-endian
  if (8 + headerLen > buffer.byteLength) {
    throw new Error(
      `Corrupt chunk: header length ${headerLen} exceeds buffer size ${buffer.byteLength}`,
    );
  }

  const headerBytes = new Uint8Array(buffer, 8, headerLen);
  const headerText = new TextDecoder('utf-8').decode(headerBytes);
  const header: ChunkHeader = JSON.parse(headerText);

  const n = header.n;
  const numDrivers = header.drivers.length;
  let offset = (8 + headerLen + 3) & ~3; // 4-byte aligned start

  // Decode per-driver channels
  const perDriver: Record<string, (Float32Array | Int8Array | Uint8Array | Int16Array)[]> = {};
  for (const ch of header.perDriver) {
    const arrList: (Float32Array | Int8Array | Uint8Array | Int16Array)[] = new Array(numDrivers);
    const itemSize = getItemSize(ch.dtype);

    for (let d = 0; d < numDrivers; d++) {
      offset = (offset + 3) & ~3; // align to 4 bytes
      arrList[d] = createTypedView(ch.dtype, buffer, offset, n);
      offset += n * itemSize;
    }
    perDriver[ch.name] = arrList;
  }

  // Decode global channels
  const global: Record<string, Float32Array | Uint8Array | Int16Array | Int8Array> = {};
  for (const ch of header.global) {
    const itemSize = getItemSize(ch.dtype);
    offset = (offset + 3) & ~3; // align to 4 bytes
    global[ch.name] = createTypedView(ch.dtype, buffer, offset, n);
    offset += n * itemSize;
  }

  return {
    header,
    i0: header.i0,
    i1: header.i0 + n,
    n,
    fps: header.fps,
    drivers: header.drivers,
    perDriver: perDriver as unknown as PerDriverData,
    global: global as unknown as GlobalData,
  };
}
