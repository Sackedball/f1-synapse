/**
 * Gap Formatter adhering to REF_DESIGN_SYSTEM.md §8 and PHASE_4_TIMING_TOWER_AND_HUD.md §10.
 *
 * Rules:
 * - Leader row (isLeader): "LEADER" or "—"
 * - Retired / Out (isOut): "DNF" or "OUT"
 * - Lapped (lapsBehind > 0): "+1 LAP" or "+n LAPS"
 * - Gap < 1.0s: "+0.xxx" (3 decimals)
 * - Gap >= 1.0s: "+x.x" (1 decimal)
 * - NaN / missing: "—"
 */

export interface FormatGapOptions {
  gapSeconds: number;
  isLeader?: boolean;
  isOut?: boolean;
  lapsBehind?: number;
  useDashForLeader?: boolean;
}

export function formatGap(options: FormatGapOptions): string {
  const { gapSeconds, isLeader = false, isOut = false, lapsBehind = 0, useDashForLeader = false } = options;

  if (isOut) {
    return 'DNF';
  }

  if (isLeader) {
    return useDashForLeader ? '—' : 'LEADER';
  }

  if (lapsBehind > 0) {
    return lapsBehind === 1 ? '+1 LAP' : `+${lapsBehind} LAPS`;
  }

  if (isNaN(gapSeconds) || gapSeconds < 0) {
    return '—';
  }

  if (gapSeconds < 1.0) {
    return `+${gapSeconds.toFixed(3)}`;
  }

  return `+${gapSeconds.toFixed(1)}`;
}
