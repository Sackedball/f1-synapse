/**
 * Sector time color classifier for qualifying sessions.
 * Implements standard Formula 1 broadcast timing rules:
 * - Purple: Session fastest sector across all drivers in segment.
 * - Green: Personal best sector for driver.
 * - Yellow: Normal sector time (no personal improvement).
 */

export type SectorColorClass = 'purple' | 'green' | 'yellow' | 'none';

export function classifySector(
  time: number | null | undefined,
  sessionBest: number | null | undefined,
  personalBest: number | null | undefined,
): SectorColorClass {
  if (time === null || time === undefined || isNaN(time) || time <= 0) {
    return 'none';
  }

  // Session fastest sector (purple)
  if (sessionBest !== null && sessionBest !== undefined && Math.abs(time - sessionBest) < 0.002) {
    return 'purple';
  }

  // Personal best sector (green)
  if (personalBest !== null && personalBest !== undefined && time <= personalBest + 0.002) {
    return 'green';
  }

  // Normal sector (yellow)
  return 'yellow';
}

export function sectorSymbol(classification: SectorColorClass): string {
  switch (classification) {
    case 'purple':
      return '★ ';
    case 'green':
      return '▲ ';
    case 'yellow':
      return '● ';
    default:
      return '';
  }
}

export function formatLapTime(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || isNaN(seconds) || seconds <= 0) {
    return '—';
  }
  const mins = Math.floor(seconds / 60);
  const secs = (seconds % 60).toFixed(3);
  return mins > 0 ? `${mins}:${secs.padStart(6, '0')}` : secs;
}

export function formatGap(delta: number | null | undefined): string {
  if (delta === null || delta === undefined || isNaN(delta)) {
    return '—';
  }
  if (Math.abs(delta) < 0.001) {
    return 'POLE';
  }
  return `+${delta.toFixed(3)}`;
}
