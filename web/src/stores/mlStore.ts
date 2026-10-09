import { create } from 'zustand';
import { api } from '@/api/client';
import {
  MlTimelines,
  MlModelMetadata,
  MlBattleSegment,
  MlDriverTyreTimeline,
} from '@/api/types';

export interface TyreEstimate {
  degradationRate: number;
  paceLoss: number;
  projected: number[];
}

export interface BattleDetail {
  probability: number;
  gapMeters: number | null;
  closingSpeedKmh: number | null;
  contributions: Record<string, number> | null;
}

export interface MlStoreState {
  timelines: MlTimelines | null;
  modelMetadata: MlModelMetadata | null;
  loading: boolean;
  error: string | null;

  setTimelines: (timelines: MlTimelines | null) => void;
  loadMlTimelines: (sid: string) => Promise<void>;
  reset: () => void;

  getOvertake: (attacker: string, defender: string, t: number) => number | null;
  getBattleDetails: (attacker: string, defender: string, t: number) => BattleDetail | null;
  getPit: (driver: string, t: number) => number | null;
  getTyre: (driver: string, lap: number) => TyreEstimate | null;
  getActiveBattles: (t: number) => MlBattleSegment[];
}

// Internal index structures for O(1)/O(log N) lookup with 0 allocations
let battleMap = new Map<string, MlBattleSegment[]>();
let pitMap = new Map<string, { t0: number; dt: number; probs: number[] }>();
let tyreMap = new Map<string, MlDriverTyreTimeline>();
let allBattles: MlBattleSegment[] = [];

function rebuildIndexes(timelines: MlTimelines | null) {
  battleMap = new Map();
  pitMap = new Map();
  tyreMap = new Map();
  allBattles = timelines ? timelines.battles : [];

  if (!timelines) return;

  // Index battles by attacker_defender
  for (let i = 0; i < timelines.battles.length; i++) {
    const b = timelines.battles[i];
    const key = `${b.attacker}_${b.defender}`;
    let list = battleMap.get(key);
    if (!list) {
      list = [];
      battleMap.set(key, list);
    }
    list.push(b);
  }

  // Index pit anticipation timelines
  for (const driver in timelines.pit) {
    const pitTl = timelines.pit[driver];
    pitMap.set(driver, {
      t0: pitTl.t0,
      dt: pitTl.dt,
      probs: pitTl.probabilities,
    });
  }

  // Index tyre wear timelines
  for (const driver in timelines.tyre) {
    tyreMap.set(driver, timelines.tyre[driver]);
  }
}

export const useMlStore = create<MlStoreState>((set, get) => ({
  timelines: null,
  modelMetadata: null,
  loading: false,
  error: null,

  setTimelines: (timelines: MlTimelines | null) => {
    rebuildIndexes(timelines);
    set({
      timelines,
      modelMetadata: timelines ? timelines.model : null,
      loading: false,
      error: null,
    });
  },

  loadMlTimelines: async (sid: string) => {
    set({ loading: true, error: null });
    try {
      const timelines = await api.getMlTimelines(sid);
      get().setTimelines(timelines);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load ML timelines';
      set({ loading: false, error: message });
    }
  },

  reset: () => {
    rebuildIndexes(null);
    set({
      timelines: null,
      modelMetadata: null,
      loading: false,
      error: null,
    });
  },

  // 0-allocation hot path lookup for overtake likelihood
  getOvertake: (attacker: string, defender: string, t: number): number | null => {
    const key = `${attacker}_${defender}`;
    const segments = battleMap.get(key);
    if (!segments) return null;

    for (let i = 0; i < segments.length; i++) {
      const b = segments[i];
      const duration = b.probabilities.length * b.dt;
      if (t >= b.t0 && t <= b.t0 + duration) {
        const idx = Math.min(
          b.probabilities.length - 1,
          Math.max(0, Math.round((t - b.t0) / b.dt)),
        );
        return b.probabilities[idx];
      }
    }
    return null;
  },

  // Full battle details (probability, gap, closing speed, explainability)
  getBattleDetails: (attacker: string, defender: string, t: number): BattleDetail | null => {
    const key = `${attacker}_${defender}`;
    const segments = battleMap.get(key);
    if (!segments) return null;

    for (let i = 0; i < segments.length; i++) {
      const b = segments[i];
      const duration = b.probabilities.length * b.dt;
      if (t >= b.t0 && t <= b.t0 + duration) {
        const idx = Math.min(
          b.probabilities.length - 1,
          Math.max(0, Math.round((t - b.t0) / b.dt)),
        );
        return {
          probability: b.probabilities[idx],
          gapMeters: b.gapMeters && b.gapMeters[idx] !== undefined ? b.gapMeters[idx] : null,
          closingSpeedKmh:
            b.closingSpeedKmh && b.closingSpeedKmh[idx] !== undefined
              ? b.closingSpeedKmh[idx]
              : null,
          contributions: b.contributions || null,
        };
      }
    }
    return null;
  },

  // 0-allocation hot path lookup for pit likelihood
  getPit: (driver: string, t: number): number | null => {
    const entry = pitMap.get(driver);
    if (!entry) return null;
    const { t0, dt, probs } = entry;
    if (t < t0) return probs[0] ?? null;
    const idx = Math.round((t - t0) / dt);
    if (idx >= 0 && idx < probs.length) {
      return probs[idx];
    }
    return null;
  },

  // Lookup Bayesian tyre degradation
  getTyre: (driver: string, lap: number): TyreEstimate | null => {
    const entry = tyreMap.get(driver);
    if (!entry || !entry.laps || entry.laps.length === 0) return null;

    const lapIdx = entry.laps.indexOf(lap);
    const resolvedIdx =
      lapIdx >= 0 ? lapIdx : Math.min(Math.max(0, lap - 1), entry.laps.length - 1);

    if (
      resolvedIdx >= 0 &&
      entry.degradationSPerLap &&
      resolvedIdx < entry.degradationSPerLap.length
    ) {
      return {
        degradationRate: entry.degradationSPerLap[resolvedIdx],
        paceLoss: entry.paceLossS ? (entry.paceLossS[resolvedIdx] ?? 0) : 0,
        projected: entry.projectedDegradation ?? [],
      };
    }
    return null;
  },

  // Active battles currently taking place at time t
  getActiveBattles: (t: number): MlBattleSegment[] => {
    if (!allBattles.length) return [];
    const active: MlBattleSegment[] = [];
    for (let i = 0; i < allBattles.length; i++) {
      const b = allBattles[i];
      const duration = b.probabilities.length * b.dt;
      if (t >= b.t0 && t <= b.t0 + duration) {
        active.push(b);
      }
    }
    return active;
  },
}));
