/**
 * Delta time and mini-sector calculation utilities for Head-to-Head analysis.
 *
 * SIGN CONVENTION (AC4):
 * Δt(x) = t₁(x) - t₂(x)
 * - Positive (+) Δt means Driver 1 took longer to reach distance x (Driver 1 is SLOWER / BEHIND).
 * - Negative (-) Δt means Driver 1 reached distance x faster (Driver 1 is FASTER / AHEAD).
 */

export const DELTA_CONVENTION = {
  formula: 'Δt = t₁ - t₂',
  positiveMeaning: 'First driver slower / behind',
  negativeMeaning: 'First driver faster / ahead',
  description: '[+] First driver slower/behind · [-] First driver faster/ahead',
};

/**
 * Calculates the time delta for a segment given both drivers' speeds in km/h.
 * Returns Δt in seconds (t₁ - t₂).
 */
export function calculateSegmentDelta(
  spd1Kmh: number,
  spd2Kmh: number,
  segmentDistMeters: number,
): number {
  if (segmentDistMeters <= 0) return 0;

  // Protect against zero / very low speed
  const v1 = spd1Kmh > 5 ? spd1Kmh / 3.6 : 5 / 3.6;
  const v2 = spd2Kmh > 5 ? spd2Kmh / 3.6 : 5 / 3.6;

  const t1 = segmentDistMeters / v1;
  const t2 = segmentDistMeters / v2;

  return t1 - t2;
}

/**
 * Computes cumulative delta time across an array of distance bucket speed samples.
 */
export function computeCumulativeDelta(
  speed1: number[],
  speed2: number[],
  bucketMeters: number,
): number[] {
  const n = Math.min(speed1.length, speed2.length);
  const deltaGrid: number[] = new Array(n);
  let cumulative = 0;

  for (let i = 0; i < n; i++) {
    const s1 = speed1[i] || 0;
    const s2 = speed2[i] || 0;

    const segmentDelta = calculateSegmentDelta(s1, s2, bucketMeters);
    cumulative += segmentDelta;
    deltaGrid[i] = Number(cumulative.toFixed(3));
  }

  return deltaGrid;
}

export interface MiniSectorResult {
  sector: number;
  winner: string;
  advantageKmh: number;
}

/**
 * Splits speed samples across distance into N mini-sectors and determines the faster driver in each.
 */
export function computeMiniSectorWinners(
  speed1: number[],
  speed2: number[],
  numSectors: number,
  driver1Code: string,
  driver2Code: string,
): MiniSectorResult[] {
  const totalSamples = Math.min(speed1.length, speed2.length);
  if (totalSamples === 0 || numSectors <= 0) return [];

  const samplesPerSector = Math.max(1, Math.floor(totalSamples / numSectors));
  const results: MiniSectorResult[] = [];

  for (let s = 0; s < numSectors; s++) {
    const startIdx = s * samplesPerSector;
    const endIdx = s === numSectors - 1 ? totalSamples : Math.min(totalSamples, (s + 1) * samplesPerSector);

    let sum1 = 0;
    let sum2 = 0;
    let count = 0;

    for (let i = startIdx; i < endIdx; i++) {
      sum1 += speed1[i] || 0;
      sum2 += speed2[i] || 0;
      count++;
    }

    const avg1 = count > 0 ? sum1 / count : 0;
    const avg2 = count > 0 ? sum2 / count : 0;
    const diff = avg1 - avg2;

    results.push({
      sector: s + 1,
      winner: diff >= 0 ? driver1Code : driver2Code,
      advantageKmh: Math.abs(Math.round(diff)),
    });
  }

  return results;
}
