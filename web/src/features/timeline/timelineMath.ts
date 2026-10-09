import { RaceEvent } from '@/api/types';

export interface MarkerCluster {
  id: string;
  t: number;
  events: RaceEvent[];
  primaryType: string;
  count: number;
}

export function formatTimelineTime(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) seconds = 0;
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
}

export function formatClockTime(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) seconds = 0;
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  if (hrs > 0) {
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Maps time `t` to a 0..100% value within a zoom window [zoomStart, zoomEnd] where zoomStart/zoomEnd are in [0, 1].
 */
export function timeToPercent(
  t: number,
  durationSec: number,
  zoomStart: number = 0,
  zoomEnd: number = 1,
): number {
  if (durationSec <= 0) return 0;
  const normT = Math.max(0, Math.min(1, t / durationSec));
  const range = Math.max(0.001, zoomEnd - zoomStart);
  const pct = ((normT - zoomStart) / range) * 100;
  return pct;
}

/**
 * Maps a click/drag percentage 0..100% back to time `t`.
 */
export function percentToTime(
  pct: number,
  durationSec: number,
  zoomStart: number = 0,
  zoomEnd: number = 1,
): number {
  if (durationSec <= 0) return 0;
  const clampedPct = Math.max(0, Math.min(100, pct));
  const range = Math.max(0.001, zoomEnd - zoomStart);
  const normT = zoomStart + (clampedPct / 100) * range;
  return Math.max(0, Math.min(durationSec, normT * durationSec));
}

/**
 * Clusters events that are within `minDistancePx` of each other in the visible timeline width.
 */
export function clusterEvents(
  events: RaceEvent[],
  durationSec: number,
  timelineWidthPx: number,
  minDistancePx: number = 24,
  zoomStart: number = 0,
  zoomEnd: number = 1,
): MarkerCluster[] {
  if (events.length === 0 || durationSec <= 0 || timelineWidthPx <= 0) return [];

  // Filter events within zoom window
  const zoomT0 = zoomStart * durationSec;
  const zoomT1 = zoomEnd * durationSec;
  const visibleEvents = events.filter((e) => e.t >= zoomT0 && e.t <= zoomT1);

  if (visibleEvents.length === 0) return [];

  // Sort by time
  const sorted = [...visibleEvents].sort((a, b) => a.t - b.t);

  const clusters: MarkerCluster[] = [];
  let current: MarkerCluster | null = null;
  let lastPx = -Infinity;

  for (const ev of sorted) {
    const pct = timeToPercent(ev.t, durationSec, zoomStart, zoomEnd);
    const px = (pct / 100) * timelineWidthPx;

    if (!current || px - lastPx >= minDistancePx) {
      current = {
        id: ev.id,
        t: ev.t,
        events: [ev],
        primaryType: ev.type,
        count: 1,
      };
      clusters.push(current);
      lastPx = px;
    } else {
      current.events.push(ev);
      current.count += 1;
      // Prioritize high-severity event types for cluster icon
      if (
        ev.severity === 'major' ||
        ['retirement', 'safety_car', 'overtake'].includes(ev.type)
      ) {
        current.primaryType = ev.type;
      }
    }
  }

  return clusters;
}
