import { describe, it, expect } from 'vitest';
import { formatGap } from '../formatGap';

describe('formatGap utility', () => {
  it('formats leader row correctly', () => {
    expect(formatGap({ gapSeconds: 0, isLeader: true })).toBe('LEADER');
    expect(formatGap({ gapSeconds: 0, isLeader: true, useDashForLeader: true })).toBe('—');
  });

  it('formats non-leader with zero gap as +0.000, never LEADER', () => {
    expect(formatGap({ gapSeconds: 0, isLeader: false })).toBe('+0.000');
    expect(formatGap({ gapSeconds: 0 })).toBe('+0.000');
    expect(formatGap({ gapSeconds: 0, useDashForLeader: true })).toBe('+0.000');
  });

  it('formats sub-second gaps with 3 decimal places', () => {
    expect(formatGap({ gapSeconds: 0.123 })).toBe('+0.123');
    expect(formatGap({ gapSeconds: 0.8 })).toBe('+0.800');
    expect(formatGap({ gapSeconds: 0.005 })).toBe('+0.005');
  });

  it('formats gaps >= 1.0s with 1 decimal place', () => {
    expect(formatGap({ gapSeconds: 1.0 })).toBe('+1.0');
    expect(formatGap({ gapSeconds: 3.42 })).toBe('+3.4');
    expect(formatGap({ gapSeconds: 12.876 })).toBe('+12.9');
  });

  it('formats lapped cars with +n LAPS', () => {
    expect(formatGap({ gapSeconds: 95.0, lapsBehind: 1 })).toBe('+1 LAP');
    expect(formatGap({ gapSeconds: 180.0, lapsBehind: 2 })).toBe('+2 LAPS');
  });

  it('formats DNF / retired cars as DNF', () => {
    expect(formatGap({ gapSeconds: 0, isOut: true })).toBe('DNF');
    expect(formatGap({ gapSeconds: 12.5, isOut: true })).toBe('DNF');
  });

  it('handles invalid / NaN values gracefully', () => {
    expect(formatGap({ gapSeconds: NaN })).toBe('—');
    expect(formatGap({ gapSeconds: -1.0 })).toBe('—');
  });
});
