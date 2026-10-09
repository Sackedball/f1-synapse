import { describe, it, expect } from 'vitest';
import {
  classifySector,
  formatLapTime,
  formatGap,
} from '../sectorColors';

describe('Qualifying sector and lap time formatters', () => {
  describe('classifySector', () => {
    it('returns purple for overall fastest session sector', () => {
      expect(classifySector(30.812, 30.812, 30.812)).toBe('purple');
    });

    it('returns green for personal best sector', () => {
      expect(classifySector(30.850, 30.812, 30.850)).toBe('green');
    });

    it('returns yellow for non-improving sector', () => {
      expect(classifySector(31.200, 30.812, 30.900)).toBe('yellow');
    });

    it('returns none for null or undefined times', () => {
      expect(classifySector(null, 30.812, 30.812)).toBe('none');
      expect(classifySector(undefined, 30.812, 30.812)).toBe('none');
    });
  });

  describe('formatLapTime', () => {
    it('formats lap time with minutes and milliseconds', () => {
      expect(formatLapTime(88.197)).toBe('1:28.197');
      expect(formatLapTime(90.005)).toBe('1:30.005');
    });

    it('formats sub-minute lap time', () => {
      expect(formatLapTime(58.5)).toBe('58.500');
    });

    it('handles null and undefined', () => {
      expect(formatLapTime(null)).toBe('—');
      expect(formatLapTime(undefined)).toBe('—');
    });
  });

  describe('formatGap', () => {
    it('returns POLE for zero delta', () => {
      expect(formatGap(0)).toBe('POLE');
    });

    it('formats positive gap in seconds', () => {
      expect(formatGap(0.292)).toBe('+0.292');
      expect(formatGap(1.5)).toBe('+1.500');
    });

    it('handles null and undefined', () => {
      expect(formatGap(null)).toBe('—');
    });
  });
});
