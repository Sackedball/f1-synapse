# REF — Design System

> Single source of truth for look and feel. Phase 0 turns this into approved mockups; Phase 2 implements it as `web/src/design/tokens.css` + `tokens.ts`. **No hard-coded colors, sizes or durations anywhere else in the codebase** — always reference a token.

---

## 1. Principles

1. **Data first.** Numbers and positions are the hero; chrome stays quiet.
2. **One accent.** F1 red is used sparingly: selection, primary action, progress, focus. Everything else is neutral.
3. **Meaning through color, consistently.** Purple = overall best, green = personal best/positive, yellow = caution/slower sector, red = danger/slower delta, teal = ML/insight. Never reuse these for decoration.
4. **Motion explains change.** Animate position swaps, selection and panel changes (150–320 ms). Never animate data that updates every frame.
5. **Calm density.** Information-dense like a pit wall, but with generous alignment, tabular numerals and clear hierarchy.
6. **Accessible by default.** AA contrast, keyboard operable, reduced-motion respected, never color-only.

Branding: wordmark **"F1 SYNAPSE"** in our own type. **Do not use the official F1 logo or the proprietary Formula1 typeface.**

---

## 2. Color tokens

Base palette is carried over from the legacy app so the product keeps its identity.

```css
:root {
  /* Surfaces (dark only) */
  --surface-0: #0e0e14;   /* app backdrop, behind canvas */
  --surface-1: #15151e;   /* canvas / main background (legacy canvas bg) */
  --surface-2: #1f1f27;   /* cards, panels (legacy card) */
  --surface-3: #2c2c34;   /* controls, hover (legacy button) */
  --border:    #383845;   /* dividers, card outlines (legacy border) */
  --border-strong: #4a4a5a;

  /* Text */
  --text-1: #ffffff;
  --text-2: #c4c4cf;
  --text-3: #9494a0;      /* secondary (legacy dimmed) */
  --text-disabled: #5c5c6a;

  /* Accent */
  --accent:        #e10600;   /* F1 red */
  --accent-hover:  #f5201b;
  --accent-soft:   rgba(225, 6, 0, 0.16);  /* selected row bg */
  --focus-ring:    #ffffff;

  /* Semantic */
  --success: #00d26a;   /* personal best, positive gain */
  --warning: #ffd600;   /* yellow flag, caution */
  --danger:  #ff4d4f;   /* slower delta, error */
  --best:    #b138dd;   /* overall best (timing purple) */
  --insight: #2dd4bf;   /* ML / predictions / estimated values */

  /* Track status */
  --flag-green:  #2ecc71;
  --flag-yellow: #ffd700;
  --flag-red:    #e74c3c;
  --flag-sc:     #ffa500;
  --flag-vsc:    #c8823a;

  /* Tyre compounds */
  --tyre-soft:   #e8002d;
  --tyre-medium: #fff200;
  --tyre-hard:   #cacaca;
  --tyre-inter:  #39b54a;
  --tyre-wet:    #0067ff;
}
```

- **Team colors** come from the backend (`DriverInfo.color`) — never hard-coded in the frontend.
- **Never rely on color alone:** tyre badges also carry the letter (S/M/H/I/W); flags carry text/icon; deltas carry +/− sign.

---

## 3. Typography

Self-host all fonts (offline use). Suggested (all open-licence): **Titillium Web** (display / headings — already used in the legacy Qt styling), **Inter** (UI text), **JetBrains Mono** or Inter with tabular figures (numbers).

| Token | Size / line | Weight | Use |
|---|---|---|---|
| `--fs-display` | 32 / 36 | 700 | Lap counter, big numbers |
| `--fs-title` | 20 / 28 | 600 | Panel titles |
| `--fs-body` | 14 / 20 | 400–500 | Default |
| `--fs-small` | 12 / 16 | 500 | Labels, captions |
| `--fs-micro` | 10 / 12 | 600 caps, +0.04em | Column headers, badges |

All numeric data uses `font-variant-numeric: tabular-nums;` so gaps/times never jitter.

---

## 4. Spacing, radius, elevation

- **Spacing scale (4 px base):** `--sp-1:4px` `--sp-2:8px` `--sp-3:12px` `--sp-4:16px` `--sp-5:24px` `--sp-6:32px` `--sp-7:48px`.
- **Radius:** `--r-sm:4px` (chips) · `--r-md:8px` (cards, buttons) · `--r-lg:12px` (modals) · `--r-pill:999px`.
- **Elevation (restrained):** cards = 1 px `--border` + very subtle top-light gradient (`linear-gradient(180deg, rgba(255,255,255,.03), transparent)`); popovers/modals = `0 8px 24px rgba(0,0,0,.5)`. **No heavy backdrop-blur over the canvas** (perf).
- **Density:** `comfortable` (default) and `compact` (rows −20%), toggled via `data-density` on `<html>`.

---

## 5. Motion tokens

```css
:root {
  --dur-fast: 120ms;   /* hover, press */
  --dur-base: 200ms;   /* selection, panel open */
  --dur-slow: 320ms;   /* position swap, layout shifts */
  --ease-out: cubic-bezier(0.2, 0.8, 0.2, 1);
  --ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);
}
@media (prefers-reduced-motion: reduce) { :root { --dur-fast:0ms; --dur-base:0ms; --dur-slow:0ms; } }
```

Rules: animate `transform`/`opacity` only; position swaps use FLIP; a driver gaining a place flashes a green ▲ for 2 s, losing a place a red ▼; no looping animations except the live-flag pill pulse (disabled under reduced motion).

---

## 6. Layout

- **Race workspace grid (≥1600 px wide):** `tower 320px | canvas 1fr | context 360px`; top strip 56 px; bottom timeline+controls 96 px.
- **Breakpoints:** `≥1600` full · `1280–1599` context panel collapsible to a rail · `<1280` tower shows code+gap only, panels become drawers. Test sizes: 1366×768, 1920×1080, 2560×1440.
- The canvas never sits *under* an opaque panel; panels reserve their own columns (no fixed pixel margins baked into canvas math — use the canvas element's measured size).

---

## 7. Component inventory (build once in Phase 2, reuse everywhere)

`Button` (primary/secondary/ghost/icon) · `Chip` · `Badge` · `TyreBadge` · `FlagPill` · `DriverChip` (team bar + code) · `Card` · `PanelHeader` · `Tabs` · `Segmented` · `Toggle` · `Slider` · `Tooltip` · `Popover` · `Dialog` · `Menu` · `Gauge` (arc) · `StatBar` (throttle/brake/tyre) · `Sparkline` · `Skeleton` · `EmptyState` · `ErrorState` · `Kbd` (shortcut key cap) · `ProgressBar`.

Built on Radix primitives for accessibility; icons from lucide. Each component has a "gallery" story at `/dev/gallery` showing all states (default, hover, focus, active, disabled, loading, error).

---

## 8. Data-viz conventions

- Sector/lap cells: purple (overall best) › green (personal best) › yellow (slower) › neutral.
- Delta: `+0.123` red (slower), `−0.123` green (faster). Always show sign.
- Gaps: one decimal over 1 s (`+3.4`), three below (`+0.812`); `LAP +1` for lapped.
- Charts (uPlot): thin 1.5 px lines, team-colored per driver, shared cursor, no chart junk, axis labels `--text-3`.
- Estimated/ML values always carry the `--insight` color and the word "est." or an info icon.

---

## 9. Accessibility checklist (enforced in Phase 9)

- Text contrast ≥ 4.5:1 (3:1 for ≥ 18 px/large); UI boundaries ≥ 3:1.
- Every interactive element reachable by keyboard with a visible focus ring (`--focus-ring`, 2 px offset).
- Timing tower uses table semantics (`role="table"`/rows); flag changes announced via `aria-live="polite"`.
- `prefers-reduced-motion` respected; optional **colorblind-safe mode** (tyre shapes + patterned flags).
- Hit targets ≥ 32×32 px on controls (24 px minimum for dense table rows).

---

## 10. v1.1 Visual Direction (Phase 3.5 Elevation)

1. **Hero hierarchy:** The circuit ribbon and moving cars are the undisputed hero; application chrome and border frames recede into deep dark hues.
2. **Depth via luminance & 1px highlights, never blur:** Zero `backdrop-filter` or blur shaders over the WebGL canvas. Visual depth is established exclusively through discrete luminance steps (`--surface-0` through `--surface-4`) and 1px crisp top/inner edge highlights (`--border-hi`).
3. **Light carries functional meaning:** Glow and luminescence signify active state (selected driver halo, DRS flap open/active zone, caution/SC flag transitions). No decorative ambient glow without data state.
4. **Broadcast typography & hierarchy:**
   - Display face (`Titillium Web`): Driver acronyms (VER, HAM), panel titles, large numeric gauges, lap counter.
   - Micro small-caps (`Inter` / `JetBrains Mono` with uppercase and letter-spacing +0.05em): Status tags, column headings, mini badges.
   - Numeric tabular figures (`JetBrains Mono` / `tabular-nums`): Lap times, interval/leader delta gaps, speed, gear.
   - Elevated base scales: Tower driver codes raised to 15px bold; gap displays raised to 13px tabular-nums.
5. **Accent restraint:** F1 racing red (`--accent`) is reserved strictly for primary interactive focus, selected driver indicators, progress playheads, and urgent alerts.

### v1.1 Canvas & Surface Tokens

| Token | CSS Variable | Pixi Hex / Value | Target Contrast / Role |
|---|---|---|---|
| Deep Backdrop | `--surface-0` | `0x08080c` | Deepest pitch behind canvas (L ≈ 3.5%) |
| Canvas Workspace | `--surface-1` | `0x12121a` | App workspace / main canvas (L ≈ 8%) |
| Panels & Tower | `--surface-2` | `0x1a1a24` | Sidebar cards & tower (distinguishable from surface-1) |
| Elevated Controls | `--surface-3` | `0x262634` | Hover states, active buttons, toolbar caps |
| Popovers & Drawers | `--surface-4` | `0x323244` | Top overlays, modals |
| Restrained Divider | `--border` | `0x2c2c3a` | 1px subtle boundary |
| High Highlight | `--border-hi` | `0x444458` | 1px top highlight line for surface depth |
| Strong Border | `--border-strong` | `0x46465c` | Focus and active container strokes |
| Track Asphalt | `--track-asphalt` | `0x1c1c28` | Lighter asphalt ribbon (contrast ≥ 1.3:1 vs canvas) |
| Track Edge Line | `--track-edge` | `0x4f5366` | Crisp 1.5px edge boundary (contrast ≥ 3:1 vs canvas) |
| Track Outer Glow | `--track-glow` | `0x3a3e50` | Soft pre-rendered edge luminescence |
| Track Centerline | `--track-centerline` | `0x323444` | Subtle dashed trajectory guide |
| DRS Zone Band | `--drs-band` | `0x00d26a` (alpha 0.35) | Translucent zone perimeter with "DRS n" tag |
| Active DRS Glow | `--drs-band-active`| `0x00ff7f` (alpha 0.95) | Bright luminescence only when DRS is open |
| Vignette Dot Grid | `--grid-dot` | `0xffffff` (alpha 0.035) | Faint spatial coordinate grid |
| Car Halo Ring | `--car-halo` | `0xffffff` (alpha 0.85) | High-visibility selection pulse |
| Driver Label Pill | `--label-bg` | `0x12121a` (alpha 0.88) | Broadcast pill with team color indicator bar |

