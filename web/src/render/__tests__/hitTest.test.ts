import { describe, it, expect } from 'vitest';
import { findNearestCar, CarScreenPosition } from '../hitTest';

describe('Car hit-testing', () => {
  const cars: CarScreenPosition[] = [
    { code: 'VER', x: 100, y: 100, index: 0 },
    { code: 'NOR', x: 200, y: 150, index: 1 },
    { code: 'LEC', x: 205, y: 155, index: 2 },
  ];

  it('detects a car within maximum distance', () => {
    const result = findNearestCar(105, 102, cars, 15);
    expect(result).not.toBeNull();
    expect(result?.code).toBe('VER');
    expect(result?.index).toBe(0);
  });

  it('returns null when clicking far away from any car', () => {
    const result = findNearestCar(500, 500, cars, 15);
    expect(result).toBeNull();
  });

  it('selects the closest car when multiple cars are nearby', () => {
    // Click closer to NOR (200, 150) than LEC (205, 155)
    const result1 = findNearestCar(198, 149, cars, 15);
    expect(result1?.code).toBe('NOR');

    // Click closer to LEC (205, 155)
    const result2 = findNearestCar(206, 156, cars, 15);
    expect(result2?.code).toBe('LEC');
  });

  it('handles empty car array gracefully', () => {
    const result = findNearestCar(100, 100, [], 15);
    expect(result).toBeNull();
  });
});
