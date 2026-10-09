import { describe, it, expect } from 'vitest';
import {
  formatTimelineTime,
  formatClockTime,
  timeToPercent,
  percentToTime,
  clusterEvents,
} from '../timelineMath';
import { RaceEvent } from '@/api/types';

describe('timelineMath', () => {
  describe('formatTimelineTime', () => {
    it('formats 0s correctly', () => {
      expect(formatTimelineTime(0)).toBe('00:00.000');
    });

    it('formats minutes, seconds, milliseconds', () => {
      expect(formatTimelineTime(75.5)).toBe('01:15.500');
    });

    it('handles negative or invalid values gracefully', () => {
      expect(formatTimelineTime(-10)).toBe('00:00.000');
      expect(formatTimelineTime(NaN)).toBe('00:00.000');
    });
  });

  describe('formatClockTime', () => {
    it('formats mm:ss when under an hour', () => {
      expect(formatClockTime(65)).toBe('01:05');
      expect(formatClockTime(0)).toBe('00:00');
    });

    it('formats hh:mm:ss when over an hour', () => {
      expect(formatClockTime(3665)).toBe('01:01:05');
    });
  });

  describe('timeToPercent & percentToTime', () => {
    const duration = 100;

    it('maps correctly without zoom', () => {
      expect(timeToPercent(0, duration)).toBe(0);
      expect(timeToPercent(50, duration)).toBe(50);
      expect(timeToPercent(100, duration)).toBe(100);

      expect(percentToTime(0, duration)).toBe(0);
      expect(percentToTime(50, duration)).toBe(50);
      expect(percentToTime(100, duration)).toBe(100);
    });

    it('maps correctly with zoom [0.25, 0.75]', () => {
      // Zoom window is 25s .. 75s
      // t = 25s should be 0%
      expect(timeToPercent(25, duration, 0.25, 0.75)).toBeCloseTo(0);
      // t = 50s should be 50%
      expect(timeToPercent(50, duration, 0.25, 0.75)).toBeCloseTo(50);
      // t = 75s should be 100%
      expect(timeToPercent(75, duration, 0.25, 0.75)).toBeCloseTo(100);

      expect(percentToTime(0, duration, 0.25, 0.75)).toBeCloseTo(25);
      expect(percentToTime(50, duration, 0.25, 0.75)).toBeCloseTo(50);
      expect(percentToTime(100, duration, 0.25, 0.75)).toBeCloseTo(75);
    });
  });

  describe('clusterEvents', () => {
    const sampleEvents: RaceEvent[] = [
      { id: '1', t: 10, type: 'battle', lap: 1, label: 'Battle', severity: 'minor' },
      { id: '2', t: 10.5, type: 'overtake', lap: 1, label: 'Overtake', severity: 'major' },
      { id: '3', t: 50, type: 'pit_in', lap: 3, label: 'Pit In', severity: 'minor' },
      { id: '4', t: 80, type: 'retirement', lap: 5, label: 'Retirement', severity: 'major' },
    ];

    it('clusters events that are closer than minDistancePx', () => {
      const clusters = clusterEvents(sampleEvents, 100, 1000, 24);
      // Events 1 and 2 at t=10 and t=10.5 are separated by 5px (at 1000px width), so they should cluster
      expect(clusters.length).toBe(3);
      expect(clusters[0].count).toBe(2);
      expect(clusters[0].events).toHaveLength(2);
      expect(clusters[0].primaryType).toBe('overtake'); // major overtake takes priority over minor battle
      expect(clusters[1].id).toBe('3');
      expect(clusters[2].id).toBe('4');
    });

    it('returns empty array when no events or invalid duration', () => {
      expect(clusterEvents([], 100, 1000)).toEqual([]);
      expect(clusterEvents(sampleEvents, 0, 1000)).toEqual([]);
    });

    it('respects zoom window', () => {
      // Zoom from t=40s (0.4) to t=100s (1.0)
      const clusters = clusterEvents(sampleEvents, 100, 1000, 24, 0.4, 1.0);
      expect(clusters.length).toBe(2);
      expect(clusters[0].id).toBe('3');
      expect(clusters[1].id).toBe('4');
    });
  });
});
