/**
 * Lap time outlier filtering utilities.
 * Filters out in/out pit laps, safety car laps, and yellow flag anomalies to provide clean pace distribution.
 */

export interface LapTimeRecord {
  lap: number;
  timeSec: number;
  pit_in?: boolean;
  pit_out?: boolean;
  driver?: string;
  isOutlier?: boolean;
}

export interface PaceStatistics {
  min: number;
  median: number;
  max: number;
  bestLap: number;
  count: number;
  outlierCount: number;
}

/**
 * Filter outlier laps based on pit in/out flags and reasonable bounds relative to median.
 */
export function filterLapOutliers<T extends { lap: number; timeSec?: number; pit_in?: boolean; pit_out?: boolean }>(
  laps: T[],
  options: {
    minTimeSec?: number;
    maxMultiplierOfMedian?: number;
  } = {},
): { clean: T[]; outliers: T[] } {
  const minTimeSec = options.minTimeSec ?? 60;
  const maxMultiplierOfMedian = options.maxMultiplierOfMedian ?? 1.25;

  // First pass: filter out obvious pit in/out laps and sub-threshold times
  const validCandidates = laps.filter((l) => {
    if (l.pit_in || l.pit_out) return false;
    const t = l.timeSec || 0;
    return t >= minTimeSec;
  });

  if (validCandidates.length === 0) {
    return { clean: [], outliers: [...laps] };
  }

  // Calculate median
  const sortedTimes = validCandidates.map((l) => l.timeSec || 0).sort((a, b) => a - b);
  const median = sortedTimes[Math.floor(sortedTimes.length / 2)];
  const maxAllowedTime = median * maxMultiplierOfMedian;

  const clean: T[] = [];
  const outliers: T[] = [];

  for (const l of laps) {
    const t = l.timeSec || 0;
    if (l.pit_in || l.pit_out || t < minTimeSec || t > maxAllowedTime) {
      outliers.push(l);
    } else {
      clean.push(l);
    }
  }

  return { clean, outliers };
}

/**
 * Calculates pace statistics (min, median, max, count) from a set of lap records.
 */
export function calculatePaceStats(timesSec: number[]): PaceStatistics {
  const valid = timesSec.filter((t) => t > 0).sort((a, b) => a - b);
  if (valid.length === 0) {
    return { min: 0, median: 0, max: 0, bestLap: 0, count: 0, outlierCount: 0 };
  }

  const min = valid[0];
  const max = valid[valid.length - 1];
  const median = valid[Math.floor(valid.length / 2)];

  return {
    min,
    median,
    max,
    bestLap: min,
    count: valid.length,
    outlierCount: timesSec.length - valid.length,
  };
}
