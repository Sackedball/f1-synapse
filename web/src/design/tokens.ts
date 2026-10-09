/**
 * Design system tokens in TypeScript.
 * Single source of truth for programmatic access (e.g. PixiJS canvas, charts).
 * Matches REF_DESIGN_SYSTEM.md and tokens.css.
 */

export const colors = {
  // Surfaces (widened luminance ladder)
  surface0: '#08080c',
  surface1: '#12121a',
  surface2: '#1a1a24',
  surface3: '#262634',
  surface4: '#323244',
  border: '#2c2c3a',
  borderHi: '#444458',
  borderStrong: '#46465c',

  // Canvas & Track Elevation Tokens
  trackAsphalt: '#2a2b38',
  trackEdge: '#5e637a',
  trackGlow: 'rgba(94, 99, 122, 0.25)',
  trackCenterline: '#3e4152',
  drsBand: 'rgba(0, 210, 106, 0.35)',
  drsBandActive: '#00ff7f',
  gridDot: 'rgba(255, 255, 255, 0.035)',
  carHalo: 'rgba(255, 255, 255, 0.85)',
  labelBg: 'rgba(18, 18, 26, 0.88)',

  // Text
  text1: '#ffffff',
  text2: '#c4c4cf',
  text3: '#9494a0',
  textDisabled: '#5c5c6a',

  // Accent
  accent: '#e10600',
  accentBright: '#ff1801',
  accentHover: '#f5201b',
  accentSoft: 'rgba(225, 6, 0, 0.16)',
  accentGlow: 'rgba(225, 6, 0, 0.35)',
  focusRing: '#ffffff',

  // Semantic
  success: '#00d26a',
  warning: '#ffd600',
  danger: '#ff4d4f',
  best: '#b138dd',
  insight: '#2dd4bf',
  insightGlow: 'rgba(45, 212, 191, 0.2)',

  // Track status flags
  flagGreen: '#2ecc71',
  flagYellow: '#ffd700',
  flagRed: '#e74c3c',
  flagSc: '#ffa500',
  flagVsc: '#c8823a',

  // Tyre compounds
  tyreSoft: '#e8002d',
  tyreMedium: '#fff200',
  tyreHard: '#cacaca',
  tyreInter: '#39b54a',
  tyreWet: '#0067ff',
} as const;

/** Sample team colors for mockups/testing (real team colors come from backend DriverInfo) */
export const mockTeamColors = {
  VER: '#3671c6',
  NOR: '#ff8000',
  LEC: '#e8002d',
  RUS: '#27f4d2',
  ALO: '#229971',
} as const;

/** Hex numeric equivalents for PixiJS (0xRRGGBB) */
export const pixiColors = {
  surface0: 0x08080c,
  surface1: 0x12121a,
  surface2: 0x1a1a24,
  surface3: 0x262634,
  surface4: 0x323244,
  border: 0x2c2c3a,
  borderHi: 0x444458,
  borderStrong: 0x46465c,
  trackAsphalt: 0x1c1c28,
  trackEdge: 0x4f5366,
  trackGlow: 0x3a3e50,
  trackCenterline: 0x323444,
  drsBand: 0x00d26a,
  drsBandActive: 0x00ff7f,
  gridDot: 0xffffff,
  carHalo: 0xffffff,
  labelBg: 0x12121a,
  text1: 0xffffff,
  text2: 0xc4c4cf,
  text3: 0x9494a0,
  textDisabled: 0x5c5c6a,
  accent: 0xe10600,
  success: 0x00d26a,
  warning: 0xffd600,
  danger: 0xff4d4f,
  best: 0xb138dd,
  insight: 0x2dd4bf,
  trackInner: 0x4f5366,
  trackOuter: 0x4f5366,
  drsZone: 0x00d26a,
} as const;

export const spacing = {
  1: '4px',
  2: '8px',
  3: '12px',
  4: '16px',
  5: '24px',
  6: '32px',
  7: '48px',
} as const;

export const radius = {
  xs: '2px',
  sm: '4px',
  md: '8px',
  lg: '12px',
  pill: '999px',
} as const;

export const typography = {
  fontDisplay: "'Titillium Web', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  fontSans: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  fontMono: "'JetBrains Mono', monospace",
  fsDisplay: '32px',
  lhDisplay: '36px',
  fsTitle: '20px',
  lhTitle: '28px',
  fsBody: '14px',
  lhBody: '20px',
  fsSmall: '12px',
  lhSmall: '16px',
  fsMicro: '10px',
  lhMicro: '12px',
} as const;

export const motion = {
  durFast: '120ms',
  durBase: '200ms',
  durSlow: '320ms',
  easeOut: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
  easeInOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
} as const;
