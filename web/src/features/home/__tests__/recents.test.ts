import { describe, it, expect, beforeEach } from 'vitest';
import {
  getRecentSessions,
  addRecentSession,
  clearRecentSessions,
} from '../recents';



describe('Recents management utility', () => {
  beforeEach(() => {
    clearRecentSessions();
  });

  it('starts with an empty list', () => {
    expect(getRecentSessions()).toEqual([]);
  });

  it('adds a session and stores it', () => {
    const s1 = {
      sessionId: '2026_3_R',
      eventName: 'Japanese Grand Prix',
      round: 3,
      year: 2026,
      type: 'R',
    };
    const res = addRecentSession(s1);
    expect(res).toHaveLength(1);
    expect(res[0].sessionId).toBe('2026_3_R');

    const loaded = getRecentSessions();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].sessionId).toBe('2026_3_R');
  });

  it('caps recents list at 5 sessions and puts latest first', () => {
    for (let r = 1; r <= 6; r++) {
      addRecentSession({
        sessionId: `2026_${r}_R`,
        eventName: `Grand Prix ${r}`,
        round: r,
        year: 2026,
        type: 'R',
      });
    }

    const loaded = getRecentSessions();
    expect(loaded).toHaveLength(5);
    // Most recent is round 6
    expect(loaded[0].sessionId).toBe('2026_6_R');
    expect(loaded[4].sessionId).toBe('2026_2_R');
  });

  it('deduplicates when re-adding the same session and bumps to top', () => {
    addRecentSession({
      sessionId: '2026_1_R',
      eventName: 'Bahrain Grand Prix',
      round: 1,
      year: 2026,
      type: 'R',
    });
    addRecentSession({
      sessionId: '2026_2_R',
      eventName: 'Saudi Arabian Grand Prix',
      round: 2,
      year: 2026,
      type: 'R',
    });

    // Re-add round 1
    const res = addRecentSession({
      sessionId: '2026_1_R',
      eventName: 'Bahrain Grand Prix',
      round: 1,
      year: 2026,
      type: 'R',
    });

    expect(res).toHaveLength(2);
    expect(res[0].sessionId).toBe('2026_1_R');
    expect(res[1].sessionId).toBe('2026_2_R');
  });
});
