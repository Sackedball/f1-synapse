import { describe, it, expect, beforeEach } from 'vitest';
import { useMlStore } from '../mlStore';
import { MlTimelines } from '@/api/types';

describe('mlStore unit tests', () => {
  beforeEach(() => {
    useMlStore.getState().reset();
  });

  const mockTimelines: MlTimelines = {
    sessionId: 'test-session',
    model: {
      name: 'F1 Synapse Hybrid Predictive Engine',
      version: '1.0.0',
      trainedOn: '2026 Synthetic Physics Engine',
      note: 'Synthetic target caveat',
      isSynthetic: true,
    },
    battles: [
      {
        attacker: 'VER',
        defender: 'NOR',
        t0: 10.0,
        dt: 0.5,
        probabilities: [0.35, 0.42, 0.58, 0.65],
        gapMeters: [25.0, 22.0, 18.0, 14.0],
        closingSpeedKmh: [4.5, 6.0, 8.2, 9.5],
        contributions: {
          proximity: 0.4,
          closing_speed: 0.3,
          drs_boost: 0.2,
          tyre_advantage: 0.1,
        },
      },
    ],
    pit: {
      VER: {
        driver: 'VER',
        t0: 0.0,
        dt: 1.0,
        probabilities: [0.05, 0.12, 0.25, 0.65, 0.88],
      },
    },
    tyre: {
      VER: {
        driver: 'VER',
        laps: [1, 2, 3],
        degradationSPerLap: [0.03, 0.035, 0.04],
        paceLossS: [0.03, 0.065, 0.105],
        projectedDegradation: [0.14, 0.18, 0.23, 0.29, 0.36],
      },
    },
  };

  it('initializes in empty state', () => {
    const state = useMlStore.getState();
    expect(state.timelines).toBeNull();
    expect(state.modelMetadata).toBeNull();
    expect(state.getOvertake('VER', 'NOR', 10.0)).toBeNull();
  });

  it('rebuilds indexes and looks up overtake probabilities accurately', () => {
    useMlStore.getState().setTimelines(mockTimelines);

    // Exact matches
    expect(useMlStore.getState().getOvertake('VER', 'NOR', 10.0)).toBe(0.35);
    expect(useMlStore.getState().getOvertake('VER', 'NOR', 10.5)).toBe(0.42);
    expect(useMlStore.getState().getOvertake('VER', 'NOR', 11.5)).toBe(0.65);

    // Gaps outside segment should return null
    expect(useMlStore.getState().getOvertake('VER', 'NOR', 5.0)).toBeNull();
    expect(useMlStore.getState().getOvertake('VER', 'NOR', 15.0)).toBeNull();
    expect(useMlStore.getState().getOvertake('NOR', 'VER', 10.0)).toBeNull();
  });

  it('retrieves full battle details including explainability contributions', () => {
    useMlStore.getState().setTimelines(mockTimelines);

    const details = useMlStore.getState().getBattleDetails('VER', 'NOR', 11.0);
    expect(details).not.toBeNull();
    expect(details?.probability).toBe(0.58);
    expect(details?.gapMeters).toBe(18.0);
    expect(details?.closingSpeedKmh).toBe(8.2);
    expect(details?.contributions?.proximity).toBe(0.4);
  });

  it('looks up pit anticipation likelihood with O(1) time complexity', () => {
    useMlStore.getState().setTimelines(mockTimelines);

    expect(useMlStore.getState().getPit('VER', 0.0)).toBe(0.05);
    expect(useMlStore.getState().getPit('VER', 3.0)).toBe(0.65);
    expect(useMlStore.getState().getPit('VER', 4.0)).toBe(0.88);
    expect(useMlStore.getState().getPit('UNKNOWN', 1.0)).toBeNull();
  });

  it('looks up tyre degradation and forward projection array', () => {
    useMlStore.getState().setTimelines(mockTimelines);

    const tyre = useMlStore.getState().getTyre('VER', 2);
    expect(tyre).not.toBeNull();
    expect(tyre?.degradationRate).toBe(0.035);
    expect(tyre?.paceLoss).toBe(0.065);
    expect(tyre?.projected).toHaveLength(5);
    expect(tyre?.projected[4]).toBe(0.36);
  });

  it('filters active battles at time t', () => {
    useMlStore.getState().setTimelines(mockTimelines);

    const activeAt10 = useMlStore.getState().getActiveBattles(10.5);
    expect(activeAt10).toHaveLength(1);
    expect(activeAt10[0].attacker).toBe('VER');

    const activeAt50 = useMlStore.getState().getActiveBattles(50.0);
    expect(activeAt50).toHaveLength(0);
  });
});
