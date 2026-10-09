import { describe, it, expect } from 'vitest';
import {
  formatSpeed,
  formatTemp,
  formatDistance,
  speedUnit,
  tempUnit,
  distanceUnit,
} from '../units';

describe('Unit conversion utilities', () => {
  describe('formatSpeed', () => {
    it('formats metric speeds in km/h', () => {
      expect(formatSpeed(300, 'metric')).toBe('300 km/h');
      expect(formatSpeed(0, 'metric')).toBe('0 km/h');
      expect(formatSpeed(125.4, 'metric')).toBe('125 km/h');
    });

    it('formats imperial speeds in mph', () => {
      expect(formatSpeed(300, 'imperial')).toBe('186 mph');
      expect(formatSpeed(100, 'imperial')).toBe('62 mph');
      expect(formatSpeed(0, 'imperial')).toBe('0 mph');
    });

    it('handles NaN gracefully', () => {
      expect(formatSpeed(NaN, 'metric')).toBe('—');
      expect(formatSpeed(NaN, 'imperial')).toBe('—');
    });
  });

  describe('formatTemp', () => {
    it('formats metric temperatures in °C', () => {
      expect(formatTemp(25, 'metric')).toBe('25°C');
      expect(formatTemp(0, 'metric')).toBe('0°C');
      expect(formatTemp(-5.2, 'metric')).toBe('-5°C');
    });

    it('formats imperial temperatures in °F', () => {
      expect(formatTemp(0, 'imperial')).toBe('32°F');
      expect(formatTemp(100, 'imperial')).toBe('212°F');
      expect(formatTemp(25, 'imperial')).toBe('77°F');
    });

    it('handles NaN gracefully', () => {
      expect(formatTemp(NaN, 'metric')).toBe('—');
    });
  });

  describe('formatDistance', () => {
    it('formats short metric distances in m', () => {
      expect(formatDistance(500, 'metric')).toBe('500 m');
    });

    it('formats long metric distances in km', () => {
      expect(formatDistance(5807, 'metric')).toBe('5.81 km');
    });

    it('formats short imperial distances in ft', () => {
      expect(formatDistance(100, 'imperial')).toBe('328 ft');
    });

    it('formats long imperial distances in mi', () => {
      expect(formatDistance(5807, 'imperial')).toBe('3.61 mi');
    });

    it('handles NaN gracefully', () => {
      expect(formatDistance(NaN, 'metric')).toBe('—');
    });
  });

  describe('unit labels', () => {
    it('returns appropriate unit labels', () => {
      expect(speedUnit('metric')).toBe('km/h');
      expect(speedUnit('imperial')).toBe('mph');
      expect(tempUnit('metric')).toBe('°C');
      expect(tempUnit('imperial')).toBe('°F');
      expect(distanceUnit('metric')).toBe('km');
      expect(distanceUnit('imperial')).toBe('mi');
    });
  });
});
