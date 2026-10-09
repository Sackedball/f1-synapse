import { ParsedChunk, parseChunk } from './binary';
import { Snapshot } from './snapshot';

export type ChunkFetcher = (sid: string, k: number) => Promise<ArrayBuffer>;

export interface FrameStoreOptions {
  sid: string;
  totalFrames: number;
  fps?: number;
  chunkSize?: number;
  maxCacheSize?: number;
  fetchChunk?: ChunkFetcher;
  onBufferingChange?: (buffering: boolean) => void;
}

export class FrameStore {
  readonly sid: string;
  readonly totalFrames: number;
  readonly fps: number;
  readonly chunkSize: number;
  readonly maxCacheSize: number;

  private fetcher: ChunkFetcher;
  private onBufferingChange?: (buffering: boolean) => void;

  // LRU cache: chunk index -> ParsedChunk
  private cache = new Map<number, ParsedChunk>();
  // In-flight fetches to avoid duplicate requests
  private inFlight = new Map<number, Promise<ParsedChunk>>();
  // Access timestamps for LRU eviction (chunk 0 is never evicted)
  private accessTimes = new Map<number, number>();
  private clockTime = 0;
  private isBuffering = false;

  constructor(options: FrameStoreOptions) {
    this.sid = options.sid;
    this.totalFrames = options.totalFrames;
    this.fps = options.fps ?? 25;
    this.chunkSize = options.chunkSize ?? 1500;
    this.maxCacheSize = options.maxCacheSize ?? 32;
    this.fetcher = options.fetchChunk ?? defaultChunkFetcher;
    this.onBufferingChange = options.onBufferingChange;
  }

  get totalChunks(): number {
    if (this.totalFrames === 0) return 0;
    return Math.ceil(this.totalFrames / this.chunkSize);
  }

  get loadedChunks(): number[] {
    return Array.from(this.cache.keys());
  }

  /**
   * Directly sets a pre-parsed chunk into the store (useful for fixtures / tests).
   */
  setChunk(k: number, chunk: ParsedChunk): void {
    this.cache.set(k, chunk);
    this.accessTimes.set(k, ++this.clockTime);
  }

  hasChunk(k: number): boolean {
    return this.cache.has(k);
  }

  getChunk(k: number): ParsedChunk | undefined {
    const chunk = this.cache.get(k);
    if (chunk) {
      this.accessTimes.set(k, ++this.clockTime);
    }
    return chunk;
  }

  /**
   * Request chunk k asynchronously, returning existing promise or cached chunk if present.
   */
  async loadChunk(k: number): Promise<ParsedChunk> {
    if (k < 0 || (this.totalFrames > 0 && k >= this.totalChunks)) {
      throw new Error(`Chunk ${k} out of range [0, ${this.totalChunks - 1}]`);
    }

    const cached = this.cache.get(k);
    if (cached) {
      this.accessTimes.set(k, ++this.clockTime);
      return cached;
    }

    const pending = this.inFlight.get(k);
    if (pending) {
      return pending;
    }

    const promise = (async () => {
      try {
        const buffer = await this.fetcher(this.sid, k);
        const parsed = parseChunk(buffer);
        this.cache.set(k, parsed);
        this.accessTimes.set(k, ++this.clockTime);
        this.pruneCache();
        return parsed;
      } finally {
        this.inFlight.delete(k);
      }
    })();

    this.inFlight.set(k, promise);
    return promise;
  }

  /**
   * Prefetches a chunk without throwing or awaiting.
   */
  prefetch(k: number): void {
    if (k >= 0 && (this.totalFrames === 0 || k < this.totalChunks)) {
      if (!this.cache.has(k) && !this.inFlight.has(k)) {
        this.loadChunk(k).catch(() => {
          // Ignore background prefetch errors; will retry on demand
        });
      }
    }
  }

  /**
   * Prefetches chunks ahead of the playhead proportional to playback rate.
   */
  prefetchAhead(t: number, rate: number): void {
    const currentChunk = Math.floor((t * this.fps) / this.chunkSize);
    // Higher playback rate needs more lookahead chunks
    const lookahead = Math.min(Math.max(2, Math.ceil(rate * 2)), 8);
    for (let i = 0; i <= lookahead; i++) {
      this.prefetch(currentChunk + i);
    }
  }

  private pruneCache(): void {
    if (this.cache.size <= this.maxCacheSize) return;

    // Evict least-recently used chunks, never evict chunk 0
    let oldestChunk = -1;
    let oldestTime = Infinity;

    for (const [k, time] of this.accessTimes.entries()) {
      if (k === 0) continue; // Chunk 0 is pinned
      if (time < oldestTime) {
        oldestTime = time;
        oldestChunk = k;
      }
    }

    if (oldestChunk !== -1) {
      this.cache.delete(oldestChunk);
      this.accessTimes.delete(oldestChunk);
    }
  }

  private setBuffering(buffering: boolean): void {
    if (this.isBuffering !== buffering) {
      this.isBuffering = buffering;
      this.onBufferingChange?.(buffering);
    }
  }

  /**
   * Samples data at race time t (seconds) into the preallocated snapshot out.
   * Strictly allocation-free (zero allocations in hot path).
   * Returns true if sampled successfully, false if buffering/chunk missing.
   */
  sample(t: number, out: Snapshot): boolean {
    const totalFrames = this.totalFrames;
    if (totalFrames <= 0) return false;

    // Clamp time to valid race duration
    const maxT = (totalFrames - 1) / this.fps;
    const clampedT = t < 0 ? 0 : t > maxT ? maxT : t;
    const f = clampedT * this.fps;

    let k0 = Math.floor(f);
    if (k0 >= totalFrames) k0 = totalFrames - 1;
    let k1 = k0 + 1;
    if (k1 >= totalFrames) k1 = k0;

    const alpha = k1 === k0 ? 0 : f - k0;

    const chunkIdx0 = Math.floor(k0 / this.chunkSize);
    const chunkIdx1 = Math.floor(k1 / this.chunkSize);

    const chunk0 = this.cache.get(chunkIdx0);
    const chunk1 = chunkIdx0 === chunkIdx1 ? chunk0 : this.cache.get(chunkIdx1);

    if (!chunk0 || !chunk1) {
      // Missing chunk! Signal buffering and trigger load
      this.setBuffering(true);
      if (!chunk0) {
        this.loadChunk(chunkIdx0).then(() => {
          this.checkBufferingResolved();
        });
      }
      if (!chunk1 && chunkIdx1 !== chunkIdx0) {
        this.loadChunk(chunkIdx1).then(() => {
          this.checkBufferingResolved();
        });
      }
      return false;
    }

    if (this.isBuffering) {
      this.setBuffering(false);
    }

    this.accessTimes.set(chunkIdx0, ++this.clockTime);
    if (chunkIdx1 !== chunkIdx0) {
      this.accessTimes.set(chunkIdx1, ++this.clockTime);
    }

    out.t = clampedT;
    out.frameIndex = k0;

    const n = Math.min(out.n, chunk0.drivers.length);
    const rel0 = k0 - chunk0.i0;
    const rel1 = k1 - chunk1.i0;

    const p0 = chunk0.perDriver;
    const p1 = chunk1.perDriver;

    // Sample each driver
    for (let d = 0; d < n; d++) {
      // Discrete channels use lower-frame k0
      out.gear[d] = p0.gear[d][rel0];
      out.drs[d] = p0.drs[d][rel0];
      out.lap[d] = p0.lap[d][rel0];
      out.tyre[d] = p0.tyre[d][rel0];
      out.tyreLife[d] = p0.tyreLife[d][rel0];
      out.position[d] = p0.position[d][rel0];
      out.inPit[d] = p0.inPit[d][rel0];
      const status = p0.status[d][rel0];
      out.status[d] = status;

      // Continuous channels: linear interpolation
      const x0 = p0.x[d][rel0];
      const x1 = p1.x[d][rel1];
      out.x[d] = isNaN(x0) ? x1 : isNaN(x1) ? x0 : x0 + (x1 - x0) * alpha;

      const y0 = p0.y[d][rel0];
      const y1 = p1.y[d][rel1];
      out.y[d] = isNaN(y0) ? y1 : isNaN(y1) ? y0 : y0 + (y1 - y0) * alpha;

      const d0 = p0.dist[d][rel0];
      const d1 = p1.dist[d][rel1];
      out.dist[d] = isNaN(d0) ? d1 : isNaN(d1) ? d0 : d0 + (d1 - d0) * alpha;

      const s0 = p0.speed[d][rel0];
      const s1 = p1.speed[d][rel1];
      out.speed[d] = isNaN(s0) ? s1 : isNaN(s1) ? s0 : s0 + (s1 - s0) * alpha;

      const th0 = p0.throttle[d][rel0];
      const th1 = p1.throttle[d][rel1];
      out.throttle[d] = isNaN(th0) ? th1 : isNaN(th1) ? th0 : th0 + (th1 - th0) * alpha;

      const br0 = p0.brake[d][rel0];
      const br1 = p1.brake[d][rel1];
      out.brake[d] = isNaN(br0) ? br1 : isNaN(br1) ? br0 : br0 + (br1 - br0) * alpha;

      const ga0 = p0.gapAhead[d][rel0];
      const ga1 = p1.gapAhead[d][rel1];
      out.gapAhead[d] = isNaN(ga0) ? ga1 : isNaN(ga1) ? ga0 : ga0 + (ga1 - ga0) * alpha;

      const gl0 = p0.gapLeader[d][rel0];
      const gl1 = p1.gapLeader[d][rel1];
      out.gapLeader[d] = isNaN(gl0) ? gl1 : isNaN(gl1) ? gl0 : gl0 + (gl1 - gl0) * alpha;
    }

    // Global channels
    const g0 = chunk0.global;
    const g1 = chunk1.global;

    out.trackStatus = g0.trackStatus[rel0];
    out.scPhase = g0.scPhase[rel0];

    const scx0 = g0.scX[rel0];
    const scx1 = g1.scX[rel1];
    out.scX = isNaN(scx0) ? scx1 : isNaN(scx1) ? scx0 : scx0 + (scx1 - scx0) * alpha;

    const scy0 = g0.scY[rel0];
    const scy1 = g1.scY[rel1];
    out.scY = isNaN(scy0) ? scy1 : isNaN(scy1) ? scy0 : scy0 + (scy1 - scy0) * alpha;

    // Fill orderByPosition without allocation (insertion sort on driver indices)
    for (let i = 0; i < n; i++) {
      out.orderByPosition[i] = i;
    }
    for (let i = 1; i < n; i++) {
      const key = out.orderByPosition[i];
      const keyPos = out.position[key];
      let j = i - 1;
      while (j >= 0 && out.position[out.orderByPosition[j]] > keyPos) {
        out.orderByPosition[j + 1] = out.orderByPosition[j];
        j--;
      }
      out.orderByPosition[j + 1] = key;
    }

    return true;
  }

  private checkBufferingResolved(): void {
    if (this.isBuffering) {
      this.setBuffering(false);
    }
  }

  /**
   * Fills an existing Float32Array with channel values for driver driverIndex across [t0, t1].
   * Allocation-free series extraction for telemetry / charts.
   */
  getSeries(
    driverIndex: number,
    channel: 'x' | 'y' | 'dist' | 'speed' | 'throttle' | 'brake' | 'gapAhead' | 'gapLeader',
    t0: number,
    t1: number,
    step: number,
    outArray: Float32Array,
  ): number;
  getSeries(
    driverIndex: number,
    channel: 'x' | 'y' | 'dist' | 'speed' | 'throttle' | 'brake' | 'gapAhead' | 'gapLeader',
    t0: number,
    t1: number,
    step: number,
  ): Float32Array;
  getSeries(
    driverIndex: number,
    channel: 'x' | 'y' | 'dist' | 'speed' | 'throttle' | 'brake' | 'gapAhead' | 'gapLeader',
    t0: number,
    t1: number,
    step: number,
    outArray?: Float32Array,
  ): number | Float32Array {
    const estSamples = Math.max(1, Math.floor((t1 - t0) / Math.max(1e-4, step)) + 1);
    const target = outArray ?? new Float32Array(estSamples);
    if (step <= 0 || t0 > t1 || this.totalFrames === 0) {
      return outArray ? 0 : target;
    }
    let count = 0;
    const maxSamples = target.length;

    for (let t = t0; t <= t1 && count < maxSamples; t += step) {
      const f = Math.max(0, Math.min(this.totalFrames - 1, t * this.fps));
      const k0 = Math.floor(f);
      const k1 = Math.min(this.totalFrames - 1, k0 + 1);
      const alpha = k1 === k0 ? 0 : f - k0;

      const chunkIdx0 = Math.floor(k0 / this.chunkSize);
      const chunkIdx1 = Math.floor(k1 / this.chunkSize);

      const chunk0 = this.cache.get(chunkIdx0);
      const chunk1 = chunkIdx0 === chunkIdx1 ? chunk0 : this.cache.get(chunkIdx1);

      if (!chunk0 || !chunk1) {
        target[count++] = NaN;
        continue;
      }

      const rel0 = k0 - chunk0.i0;
      const rel1 = k1 - chunk1.i0;

      const ch0 = chunk0.perDriver[channel];
      const ch1 = chunk1.perDriver[channel];

      if (!ch0 || !ch1 || driverIndex >= ch0.length) {
        target[count++] = NaN;
        continue;
      }

      const v0 = (ch0[driverIndex] as Float32Array)[rel0];
      const v1 = (ch1[driverIndex] as Float32Array)[rel1];

      target[count++] = isNaN(v0) ? v1 : isNaN(v1) ? v0 : v0 + (v1 - v0) * alpha;
    }

    if (outArray) {
      return count;
    }
    return target.subarray(0, count);
  }
}

async function defaultChunkFetcher(sid: string, k: number): Promise<ArrayBuffer> {
  const res = await fetch(`/api/sessions/${encodeURIComponent(sid)}/frames/${k}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch chunk ${k}: HTTP ${res.status}`);
  }
  return res.arrayBuffer();
}
