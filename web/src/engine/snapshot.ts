/**
 * Frontend Snapshot (output of FrameStore.sample(t)).
 * Preallocated and reused every call (strictly zero per-frame allocation).
 * Matches REF_API_CONTRACT.md §5.
 */

export interface Snapshot {
  t: number;
  frameIndex: number;
  n: number; // driver count
  x: Float32Array;
  y: Float32Array;
  dist: Float32Array;
  speed: Float32Array;
  throttle: Float32Array;
  brake: Float32Array;
  gear: Int8Array;
  drs: Uint8Array;
  lap: Int16Array;
  tyre: Uint8Array;
  tyreLife: Uint8Array;
  position: Uint8Array;
  inPit: Uint8Array;
  status: Uint8Array;
  gapAhead: Float32Array;
  gapLeader: Float32Array;
  trackStatus: number;
  scX: number;
  scY: number;
  scPhase: number;
  orderByPosition: Uint8Array; // driver indices sorted by position (index 0 = P1)
}

/**
 * Preallocates a Snapshot instance for a given number of drivers.
 */
export function createSnapshot(driverCount: number): Snapshot {
  const orderByPosition = new Uint8Array(driverCount);
  for (let i = 0; i < driverCount; i++) {
    orderByPosition[i] = i;
  }

  return {
    t: 0,
    frameIndex: 0,
    n: driverCount,
    x: new Float32Array(driverCount),
    y: new Float32Array(driverCount),
    dist: new Float32Array(driverCount),
    speed: new Float32Array(driverCount),
    throttle: new Float32Array(driverCount),
    brake: new Float32Array(driverCount),
    gear: new Int8Array(driverCount),
    drs: new Uint8Array(driverCount),
    lap: new Int16Array(driverCount),
    tyre: new Uint8Array(driverCount),
    tyreLife: new Uint8Array(driverCount),
    position: new Uint8Array(driverCount),
    inPit: new Uint8Array(driverCount),
    status: new Uint8Array(driverCount),
    gapAhead: new Float32Array(driverCount),
    gapLeader: new Float32Array(driverCount),
    trackStatus: 0,
    scX: NaN,
    scY: NaN,
    scPhase: 0,
    orderByPosition,
  };
}
