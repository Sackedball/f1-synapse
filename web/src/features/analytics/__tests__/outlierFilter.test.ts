import { describe, it, expect } from 'vitest';
import { filterLapOutliers, calculatePaceStats } from '../math/outlierFilter';

describe('outlierFilter - Pace Lap Cleaning and Pit/SC Filtering', () => {
  const sampleLaps = [
    { lap: 1, timeSec: 92.4, pit_in: false, pit_out: false },
    { lap: 2, timeSec: 91.8, pit_in: false, pit_out: false },
    { lap: 3, timeSec: 91.5, pit_in: false, pit_out: false },
    { lap: 4, timeSec: 92.1, pit_in: false, pit_out: false },
    { lap: 5, timeSec: 114.2, pit_in: true, pit_out: false }, // In-lap outlier
    { lap: 6, timeSec: 135.0, pit_in: false, pit_out: true }, // Out-lap outlier
    { lap: 7, timeSec: 90.9, pit_in: false, pit_out: false }, // Best lap
    { lap: 8, timeSec: 91.2, pit_in: false, pit_out: false },
    { lap: 9, timeSec: 145.0, pit_in: false, pit_out: false }, // VSC/SC yellow lap outlier (> 125% of median)
  ];

  it('filters out in-laps, out-laps, and abnormally slow laps', () => {
    const { clean, outliers } = filterLapOutliers(sampleLaps);

    expect(clean.map((l) => l.lap)).toEqual([1, 2, 3, 4, 7, 8]);
    expect(outliers.map((l) => l.lap)).toEqual([5, 6, 9]);
  });

  it('returns empty clean list if all laps are invalid or pit laps', () => {
    const badLaps = [
      { lap: 1, timeSec: 30, pit_in: false, pit_out: false },
      { lap: 2, timeSec: 150, pit_in: true, pit_out: false },
    ];
    const { clean, outliers } = filterLapOutliers(badLaps);
    expect(clean).toHaveLength(0);
    expect(outliers).toHaveLength(2);
  });

  it('calculates accurate pace statistics on clean laps', () => {
    const times = [90.9, 91.2, 91.5, 91.8, 92.1, 92.4];
    const stats = calculatePaceStats(times);

    expect(stats.min).toBe(90.9);
    expect(stats.bestLap).toBe(90.9);
    expect(stats.max).toBe(92.4);
    expect(stats.median).toBe(91.8);
    expect(stats.count).toBe(6);
  });

  it('handles empty times array gracefully', () => {
    const stats = calculatePaceStats([]);
    expect(stats.count).toBe(0);
    expect(stats.bestLap).toBe(0);
  });
});
