import { pixiColors } from '@/design/tokens';

/**
 * Converts a hex string ('#3671c6' or '3671c6') to a numeric 0xRRGGBB.
 */
export function parseColor(colorStr: string | null | undefined, fallback = 0xffffff): number {
  if (!colorStr) return fallback;
  const hex = colorStr.startsWith('#') ? colorStr.slice(1) : colorStr;
  const parsed = parseInt(hex, 16);
  return isNaN(parsed) ? fallback : parsed;
}

/**
 * Linearly interpolates between two numeric 0xRRGGBB colors.
 */
export function lerpColor(c1: number, c2: number, t: number): number {
  const clampT = Math.max(0, Math.min(1, t));
  const r1 = (c1 >> 16) & 0xff;
  const g1 = (c1 >> 8) & 0xff;
  const b1 = c1 & 0xff;

  const r2 = (c2 >> 16) & 0xff;
  const g2 = (c2 >> 8) & 0xff;
  const b2 = c2 & 0xff;

  const r = Math.round(r1 + (r2 - r1) * clampT);
  const g = Math.round(g1 + (g2 - g1) * clampT);
  const b = Math.round(b1 + (b2 - b1) * clampT);

  return (r << 16) | (g << 8) | b;
}

export const canvasPalette = {
  ...pixiColors,
  asphalt: 0x2a2b38,
  asphaltEdge: 0x5e637a,
  asphaltGlow: 0x424658,
  trackCenterline: 0x3e4152,
  drsZone: 0x00d26a,
  drsZoneGlow: 0x00d26a,
  drsZoneActive: 0x00ff7f,
  gridDot: 0xffffff,
  carOutline: 0x000000,
  carHalo: 0xffffff,
  labelBg: 0x12121a,
  finishLineWhite: 0xffffff,
  finishLineDark: 0x121218,
  scOrange: 0xffa500,
  scGlow: 0xff9900,
  haloWhite: 0xffffff,
  focusDimAlpha: 0.75,
  flagColors: {
    0: 0x5e637a, // Green / Normal (ribbon edge neutral, contrast >= 3:1)
    1: 0xffd700, // Yellow flag
    2: 0xffa500, // Safety Car orange
    3: 0xe74c3c, // Red flag
    4: 0xc8823a, // VSC amber
    5: 0x2ecc71, // VSC ending green
  } as Record<number, number>,
};
