import { createContext, useContext } from 'react';
import { SessionMeta, DriverInfo, LapRow, Stint, RaceControlMessage, WeatherSample } from '@/api/types';
import { Snapshot } from '@/engine/snapshot';
import { FrameStore } from '@/engine/FrameStore';
import { PlaybackClock } from '@/engine/PlaybackClock';

export interface AnalyticsContextValue {
  meta: SessionMeta | null;
  drivers: DriverInfo[];
  snapshot: Snapshot | null;
  store: FrameStore | null;
  clock: PlaybackClock | null;
  laps: LapRow[];
  stints: Stint[];
  raceControl: RaceControlMessage[];
  weather: WeatherSample[];
  totalLaps: number;
}

export const AnalyticsContext = createContext<AnalyticsContextValue | null>(null);

export function useAnalyticsContext(): AnalyticsContextValue {
  const ctx = useContext(AnalyticsContext);
  if (!ctx) {
    throw new Error('useAnalyticsContext must be used within an AnalyticsProvider');
  }
  return ctx;
}
