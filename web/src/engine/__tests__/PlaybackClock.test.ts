import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PlaybackClock } from '../PlaybackClock';

describe('PlaybackClock', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('initializes with paused status and initial values', () => {
    const clock = new PlaybackClock({ durationSec: 100 });
    expect(clock.status).toBe('paused');
    expect(clock.raceTime).toBe(0);
    expect(clock.rate).toBe(1.0);
    expect(clock.durationSec).toBe(100);
  });

  it('clamps rate between 0.25 and 32', () => {
    const clock = new PlaybackClock({ durationSec: 100 });
    clock.setRate(0.1);
    expect(clock.rate).toBe(0.25);
    clock.setRate(50);
    expect(clock.rate).toBe(32);
    clock.setRate(4);
    expect(clock.rate).toBe(4);
  });

  it('handles play, pause, and toggle', () => {
    const clock = new PlaybackClock({ durationSec: 100 });
    clock.play();
    expect(clock.status).toBe('playing');
    clock.pause();
    expect(clock.status).toBe('paused');
    clock.toggle();
    expect(clock.status).toBe('playing');
    clock.toggle();
    expect(clock.status).toBe('paused');
  });

  it('seeks accurately and clamps to duration bounds', () => {
    const clock = new PlaybackClock({ durationSec: 100 });
    clock.seek(50);
    expect(clock.raceTime).toBe(50);

    clock.seek(-10);
    expect(clock.raceTime).toBe(0);

    clock.seek(150);
    expect(clock.raceTime).toBe(100);
  });

  it('stepSeconds steps forward and backward', () => {
    const clock = new PlaybackClock({ durationSec: 100, initialTime: 10 });
    clock.stepSeconds(5);
    expect(clock.raceTime).toBe(15);
    clock.stepSeconds(-10);
    expect(clock.raceTime).toBe(5);
  });

  it('restart seeks to 0 and plays', () => {
    const clock = new PlaybackClock({ durationSec: 100, initialTime: 40 });
    clock.restart();
    expect(clock.raceTime).toBe(0);
    expect(clock.status).toBe('playing');
  });

  it('handles buffering state and resumes automatically', () => {
    const clock = new PlaybackClock({ durationSec: 100 });
    clock.play();
    expect(clock.status).toBe('playing');

    // Simulate missing chunk causing buffering
    clock.setBuffering(true);
    expect(clock.status).toBe('buffering');

    // Chunk arrives -> resolve buffering -> automatically resumes playing
    clock.setBuffering(false);
    expect(clock.status).toBe('playing');
  });

  it('does NOT deadlock if seek is called during buffering', () => {
    const clock = new PlaybackClock({ durationSec: 100 });
    clock.play();
    clock.setBuffering(true);
    expect(clock.status).toBe('buffering');

    // User scrubs timeline while buffering
    clock.seek(60);
    expect(clock.raceTime).toBe(60);
    expect(clock.status).toBe('buffering');

    // User pauses while buffering
    clock.pause();
    expect(clock.status).toBe('paused');

    // User plays again -> buffers -> resolves
    clock.play();
    clock.setBuffering(false);
    expect(clock.status).toBe('playing');
  });

  it('notifies subscribers on seek and state changes', () => {
    const clock = new PlaybackClock({ durationSec: 100 });
    const sub = vi.fn();
    const unsub = clock.subscribe(sub);

    expect(sub).toHaveBeenCalledWith(0, 'paused');
    clock.seek(25);
    expect(sub).toHaveBeenCalledWith(25, 'paused');

    unsub();
    clock.seek(50);
    expect(sub).toHaveBeenCalledTimes(2); // no more calls after unsub
  });

  it('notifies throttled subscribers at specified frequency', () => {
    const clock = new PlaybackClock({ durationSec: 100 });
    const throttledSub = vi.fn();
    clock.subscribeThrottled(throttledSub, 4); // 4 Hz = 250ms interval

    expect(throttledSub).toHaveBeenCalledWith(0, 'paused');
  });
});
