export type PlaybackStatus = 'playing' | 'paused' | 'buffering' | 'ended';

export type ClockSubscriber = (t: number, status: PlaybackStatus) => void;

export interface PlaybackClockOptions {
  durationSec: number;
  initialTime?: number;
  initialRate?: number;
}

export class PlaybackClock {
  private _raceTime: number;
  private _durationSec: number;
  private _rate: number;
  private _status: PlaybackStatus = 'paused';
  private _resumeStatusAfterBuffering: 'playing' | 'paused' = 'paused';

  private frameSubscribers = new Set<ClockSubscriber>();
  private throttledSubscribers = new Set<{
    cb: ClockSubscriber;
    intervalMs: number;
    lastCalledMs: number;
  }>();

  private animFrameId: number | null = null;
  private lastRafTimestamp: number | null = null;

  constructor(options: PlaybackClockOptions) {
    this._durationSec = Math.max(0, options.durationSec);
    this._raceTime = Math.min(Math.max(0, options.initialTime ?? 0), this._durationSec);
    this._rate = options.initialRate ?? 1.0;
  }

  get raceTime(): number {
    return this._raceTime;
  }

  get currentTime(): number {
    return this._raceTime;
  }

  get durationSec(): number {
    return this._durationSec;
  }

  get rate(): number {
    return this._rate;
  }

  get status(): PlaybackStatus {
    return this._status;
  }

  setDuration(durationSec: number): void {
    this._durationSec = Math.max(0, durationSec);
    if (this._raceTime > this._durationSec) {
      this._raceTime = this._durationSec;
      this.notifyAll();
    }
  }

  setRate(r: number): void {
    // Clamp rate between 0.25x and 32x
    this._rate = Math.max(0.25, Math.min(32, r));
  }

  play(): void {
    if (this._status === 'playing') return;

    if (this._status === 'ended' || this._raceTime >= this._durationSec) {
      this._raceTime = 0;
    }

    if (this._status === 'buffering') {
      this._resumeStatusAfterBuffering = 'playing';
      return;
    }

    this._status = 'playing';
    this.startLoop();
    this.notifyAll(undefined, true);
  }

  pause(): void {
    if (this._status === 'paused') return;

    if (this._status === 'buffering') {
      this._resumeStatusAfterBuffering = 'paused';
      this._status = 'paused';
      this.notifyAll(undefined, true);
      return;
    }

    this._status = 'paused';
    this.stopLoop();
    this.notifyAll(undefined, true);
  }

  toggle(): void {
    if (this._status === 'playing') {
      this.pause();
    } else {
      this.play();
    }
  }

  seek(t: number): void {
    const clamped = Math.max(0, Math.min(this._durationSec, t));
    this._raceTime = clamped;

    if (this._status === 'ended') {
      this._status = 'paused';
    }

    // Immediately inform subscribers so UI and canvas update during scrub
    this.notifyAll(undefined, true);
  }

  stepSeconds(dt: number): void {
    this.seek(this._raceTime + dt);
  }

  restart(): void {
    this.seek(0);
    this.play();
  }

  setBuffering(buffering: boolean): void {
    if (buffering) {
      if (this._status === 'playing') {
        this._resumeStatusAfterBuffering = 'playing';
        this._status = 'buffering';
        this.stopLoop();
        this.notifyAll(undefined, true);
      }
    } else {
      if (this._status === 'buffering') {
        if (this._resumeStatusAfterBuffering === 'playing') {
          this._status = 'playing';
          this.startLoop();
        } else {
          this._status = 'paused';
        }
        this.notifyAll(undefined, true);
      }
    }
  }

  /**
   * Subscribe to be notified on every animation frame (e.g. 60 FPS for canvas).
   */
  subscribe(cb: ClockSubscriber): () => void {
    this.frameSubscribers.add(cb);
    // Initial call
    cb(this._raceTime, this._status);
    return () => {
      this.frameSubscribers.delete(cb);
    };
  }

  /**
   * Subscribe with throttled frequency (e.g. 4 Hz or 10 Hz for UI / React).
   */
  subscribeThrottled(cb: ClockSubscriber, hz: number): () => void {
    const entry = {
      cb,
      intervalMs: 1000 / Math.max(1, hz),
      lastCalledMs: 0,
    };
    this.throttledSubscribers.add(entry);
    cb(this._raceTime, this._status);
    return () => {
      this.throttledSubscribers.delete(entry);
    };
  }

  private startLoop(): void {
    if (this.animFrameId !== null) return;
    this.lastRafTimestamp = null;

    const tick = (now: number) => {
      if (this._status !== 'playing') {
        this.animFrameId = null;
        return;
      }

      if (this.lastRafTimestamp !== null) {
        const deltaMs = now - this.lastRafTimestamp;
        // Cap deltaMs to 100ms to avoid huge time jump if tab backgrounded
        const safeDeltaSec = Math.min(deltaMs, 100) / 1000;
        this._raceTime += safeDeltaSec * this._rate;

        if (this._raceTime >= this._durationSec) {
          this._raceTime = this._durationSec;
          this._status = 'ended';
          this.notifyAll();
          this.animFrameId = null;
          return;
        }
      }

      this.lastRafTimestamp = now;
      this.notifyAll(now);

      this.scheduleTick(tick);
    };

    this.scheduleTick(tick);
  }

  private scheduleTick(cb: (now: number) => void): void {
    if (typeof requestAnimationFrame !== 'undefined') {
      this.animFrameId = requestAnimationFrame(cb);
    } else {
      // Vitest / Node fallback
      this.animFrameId = setTimeout(() => cb(Date.now()), 16) as unknown as number;
    }
  }

  private stopLoop(): void {
    if (this.animFrameId !== null) {
      if (typeof cancelAnimationFrame !== 'undefined') {
        cancelAnimationFrame(this.animFrameId);
      } else {
        clearTimeout(this.animFrameId);
      }
      this.animFrameId = null;
    }
    this.lastRafTimestamp = null;
  }

  private notifyAll(
    now: number = typeof performance !== 'undefined' ? performance.now() : Date.now(),
    forceThrottled = false,
  ): void {
    const time = this._raceTime;
    const status = this._status;

    // Per-frame subscribers
    for (const sub of this.frameSubscribers) {
      sub(time, status);
    }

    // Throttled subscribers
    for (const entry of this.throttledSubscribers) {
      if (forceThrottled || now - entry.lastCalledMs >= entry.intervalMs) {
        entry.lastCalledMs = now;
        entry.cb(time, status);
      }
    }
  }

  destroy(): void {
    this.stopLoop();
    this.frameSubscribers.clear();
    this.throttledSubscribers.clear();
  }
}
