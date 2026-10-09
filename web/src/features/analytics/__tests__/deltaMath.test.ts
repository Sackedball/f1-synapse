import { describe, it, expect } from 'vitest';
import {
  DELTA_CONVENTION,
  calculateSegmentDelta,
  computeCumulativeDelta,
  computeMiniSectorWinners,
} from '../math/deltaMath';

describe('deltaMath - H2H Delta Time and Conventions (AC4)', () => {
  it('has explicit sign convention documented in DELTA_CONVENTION', () => {
    expect(DELTA_CONVENTION.formula).toBe('Δt = t₁ - t₂');
    expect(DELTA_CONVENTION.description).toContain('[+] First driver slower/behind');
    expect(DELTA_CONVENTION.description).toContain('[-] First driver faster/ahead');
  });

  it('returns positive delta when Driver 1 is slower than Driver 2', () => {
    // 50 meters segment
    // Driver 1: 180 km/h (50 m/s) -> 1.00s
    // Driver 2: 360 km/h (100 m/s) -> 0.50s
    // delta = 1.00 - 0.50 = +0.50s
    const delta = calculateSegmentDelta(180, 360, 50);
    expect(delta).toBeGreaterThan(0);
    expect(delta).toBeCloseTo(0.5, 2);
  });

  it('returns negative delta when Driver 1 is faster than Driver 2', () => {
    // Driver 1: 360 km/h -> 0.50s
    // Driver 2: 180 km/h -> 1.00s
    // delta = 0.50 - 1.00 = -0.50s
    const delta = calculateSegmentDelta(360, 180, 50);
    expect(delta).toBeLessThan(0);
    expect(delta).toBeCloseTo(-0.5, 2);
  });

  it('returns zero delta when speeds are identical', () => {
    const delta = calculateSegmentDelta(250, 250, 100);
    expect(delta).toBeCloseTo(0, 5);
  });

  it('computes cumulative delta across distance buckets', () => {
    const spd1 = [200, 200, 200];
    const spd2 = [250, 250, 250];
    const bucketM = 50;

    const cumulative = computeCumulativeDelta(spd1, spd2, bucketM);
    expect(cumulative.length).toBe(3);
    // Since driver 1 is slower (200 vs 250), delta must strictly increase
    expect(cumulative[0]).toBeGreaterThan(0);
    expect(cumulative[1]).toBeGreaterThan(cumulative[0]);
    expect(cumulative[2]).toBeGreaterThan(cumulative[1]);
  });

  it('determines mini sector winners correctly', () => {
    // 10 samples total, 2 sectors of 5 samples
    // Sector 1: Driver 1 faster (300 km/h vs 250 km/h)
    // Sector 2: Driver 2 faster (220 km/h vs 280 km/h)
    const spd1 = [300, 300, 300, 300, 300, 220, 220, 220, 220, 220];
    const spd2 = [250, 250, 250, 250, 250, 280, 280, 280, 280, 280];

    const results = computeMiniSectorWinners(spd1, spd2, 2, 'VER', 'NOR');
    expect(results).toHaveLength(2);
    expect(results[0].sector).toBe(1);
    expect(results[0].winner).toBe('VER');
    expect(results[0].advantageKmh).toBe(50);

    expect(results[1].sector).toBe(2);
    expect(results[1].winner).toBe('NOR');
    expect(results[1].advantageKmh).toBe(60);
  });
});
