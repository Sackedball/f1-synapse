import { create } from 'zustand';
import { api } from '@/api/client';
import { useMlStore } from './mlStore';
import {
  SessionMeta,
  TrackGeometry,
  LapRow,
  Stint,
  RaceControlMessage,
  WeatherSample,
  RaceEvent,
} from '@/api/types';

export interface SessionState {
  sid: string | null;
  meta: SessionMeta | null;
  track: TrackGeometry | null;
  laps: LapRow[];
  stints: Stint[];
  raceControl: RaceControlMessage[];
  weather: WeatherSample[];
  events: RaceEvent[];
  loading: boolean;
  error: string | null;
  lastRaceTime: number;

  loadSession: (sid: string) => Promise<void>;
  setLastRaceTime: (t: number) => void;
  reset: () => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  sid: null,
  meta: null,
  track: null,
  laps: [],
  stints: [],
  raceControl: [],
  weather: [],
  events: [],
  loading: false,
  error: null,
  lastRaceTime: 0,

  setLastRaceTime: (t: number) => set({ lastRaceTime: Math.max(0, t) }),

  loadSession: async (sid: string) => {
    set({ loading: true, error: null, sid });
    try {
      const [meta, track, laps, stints, raceControl, weather, events] = await Promise.all([
        api.getSessionMeta(sid),
        api.getTrackGeometry(sid),
        api.getLaps(sid).catch(() => []),
        api.getStints(sid).catch(() => []),
        api.getRaceControl(sid).catch(() => []),
        api.getWeather(sid).catch(() => []),
        api.getEvents(sid).catch(() => []),
      ]);

      set({
        meta,
        track,
        laps,
        stints,
        raceControl,
        weather,
        events,
        loading: false,
        error: null,
      });

      // Load ML timelines in background
      useMlStore.getState().loadMlTimelines(sid).catch(() => {});
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load session data';
      set({ loading: false, error: message });
    }
  },

  reset: () => {
    useMlStore.getState().reset();
    set({
      sid: null,
      meta: null,
      track: null,
      laps: [],
      stints: [],
      raceControl: [],
      weather: [],
      events: [],
      loading: false,
      error: null,
    });
  },
}));
