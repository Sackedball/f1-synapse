import { describe, it, expect } from 'vitest';
import { parseColor, lerpColor, canvasPalette } from '../palette';

describe('Palette and Color interpolation', () => {
  it('parses valid hex strings to numbers', () => {
    expect(parseColor('#3671c6')).toBe(0x3671c6);
    expect(parseColor('#ffffff')).toBe(0xffffff);
    expect(parseColor('#000000')).toBe(0x000000);
    expect(parseColor('ff8000')).toBe(0xff8000);
  });

  it('falls back to default color for invalid or missing inputs', () => {
    expect(parseColor(null, 0x123456)).toBe(0x123456);
    expect(parseColor('', 0x123456)).toBe(0x123456);
    expect(parseColor('not-a-color', 0x123456)).toBe(0x123456);
  });

  it('interpolates colors smoothly across 0%, 50%, and 100%', () => {
    const black = 0x000000;
    const white = 0xffffff;

    expect(lerpColor(black, white, 0)).toBe(black);
    expect(lerpColor(black, white, 1)).toBe(white);

    const mid = lerpColor(black, white, 0.5);
    // (128 << 16) | (128 << 8) | 128 = 0x808080
    expect(mid).toBe(0x808080);
  });

  it('clamps interpolation parameter between 0 and 1', () => {
    const c1 = 0x102030;
    const c2 = 0x506070;

    expect(lerpColor(c1, c2, -0.5)).toBe(c1);
    expect(lerpColor(c1, c2, 1.5)).toBe(c2);
  });

  it('contains expected status flag colors', () => {
    expect(canvasPalette.flagColors[0]).toBeDefined(); // Green
    expect(canvasPalette.flagColors[1]).toBe(0xffd700); // Yellow
    expect(canvasPalette.flagColors[2]).toBe(0xffa500); // SC Orange
    expect(canvasPalette.flagColors[3]).toBe(0xe74c3c); // Red
  });
});
