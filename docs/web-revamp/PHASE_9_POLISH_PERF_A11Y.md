# Phase 9 — Polish, Performance & Accessibility

> **Size:** M · **Depends on:** Phases 3–8 · **Branch:** `web/phase-9-polish`

## 1. Goal
Turn "feature complete" into "feels premium": consistent motion, bulletproof states, hit performance budgets on the dev-class machine (integrated GPU, 16 GB RAM), meet accessibility targets, and add a one-click **Export** (screenshot) feature that also produces the images needed for the black book.

## 2. Scope
**In:** motion audit, states audit, performance pass + soak test, accessibility pass, responsive pass, colorblind mode, export snapshot, visual-regression baselines, bundle-size pass.
**Out:** new features; architectural changes (record in `NOTES.md` instead).

## 3. Tasks

### 3.1 Motion audit
- [ ] Inventory every animation; each must use motion tokens, animate only `transform`/`opacity`, and be disabled/shortened under `prefers-reduced-motion`.
- [ ] Standardise: selection (`--dur-base`), position swap (`--dur-slow`), popover/drawer open (`--dur-base`), flag-pill color change (`--dur-base`), overlay fade (`--dur-fast`). Remove anything bespoke.
- [ ] Add subtle polish only where it explains change: panel focus highlight, key-moment jump pulse on the canvas, timeline marker hover grow.

### 3.2 State audit (every screen, every async boundary)
- [ ] For each screen/panel list its states: loading (skeleton, not spinner-only), empty, error (human message + retry + details), partial data, backend disconnected (auto-retry banner), session switching, and reconnect after backend restart.
- [ ] Ensure there are **no placeholder values** (`--`, `0`) wired to nothing anywhere (grep + manual walkthrough).
- [ ] Add toasts for non-blocking errors (chunk fetch retry, export failures) with consistent styling.

### 3.3 Performance pass
Budgets (dev machine class; measure and record on it):

| Metric | Budget |
|---|---|
| Race workspace FPS (20 cars, trails, labels, ML overlays) | ≥ 55 avg, ≥ 45 p1 |
| JS time per frame | < 4 ms (canvas) / < 2 ms (UI) |
| Seek-to-first-visual after cached chunk | < 100 ms |
| Seek to uncached chunk | < 600 ms |
| Memory after 90 min playback at 8× | no monotonic growth (< +10 % over start) |
| Initial JS bundle (home) | < 400 KB gzip (lazy-load Pixi, uPlot, dockview) |
| App cold start to interactive (cached session) | < 3 s |

- [ ] Code-split routes and heavy libs; preload the canvas chunk when a session is opened.
- [ ] Profile with Chrome Performance and the FPS overlay; fix top offenders (allocation, layout thrash, over-eager React renders, font/texture memory).
- [ ] **Soak test:** automated Playwright run playing the full race at 32× then 1×, scrubbing randomly 100 times, switching sessions 5 times; assert no console errors, no unhandled rejections, memory within budget (via `performance.memory` in Chromium).
- [ ] **Performance mode** (Settings): disables trails, glows, ML overlays, DPR cap 1; verify it lifts FPS meaningfully on integrated graphics.
- [ ] Backend: confirm chunk caching headers work (304s), and gzip is used.

### 3.4 Accessibility pass
- [ ] Run axe on every route/state; fix all serious/critical violations.
- [ ] Keyboard-only walkthrough: tab order logical, visible focus rings, no keyboard traps (dialogs, popovers, palette), all actions reachable without a mouse (canvas selection reachable via the tower).
- [ ] Contrast: verify text/UI tokens meet the thresholds in the design system; adjust tokens (not components) if needed.
- [ ] Screen reader: table semantics on tower/results, `aria-live` for flag changes and key-moment jumps, labelled icon buttons, chart summaries (`aria-label` with min/max/current).
- [ ] **Colorblind-safe mode:** tyre badges gain distinct shapes, flags gain patterns/icons, purple/green/yellow sector cells gain symbols; verify with a deuteranopia/protanopia simulation screenshot set.
- [ ] Respect `prefers-reduced-motion` and `prefers-contrast` where reasonable.

### 3.5 Responsive pass
- [ ] Verify 1366×768, 1440×900, 1920×1080, 2560×1440, 3440×1440 (ultrawide), plus 125 %/150 % OS scaling. Fix overlap, clipped text, unreachable controls. Define max content widths so ultrawide doesn't stretch charts absurdly.
- [ ] Browser matrix: latest Chrome and Edge (primary), Firefox (smoke). Note any WebGL fallbacks and add a friendly "WebGL unavailable" error state.

### 3.6 Export / share
- [ ] **Export snapshot:** button + shortcut `P` → PNG of the race workspace (canvas + tower + context + strip) at 1×/2× scale, with filename `f1synapse_<event>_lap<N>_<time>.png`. Implement via canvas compositing (Pixi `renderer.extract` + DOM-to-canvas for panels, or a server-side Playwright render if DOM capture proves unreliable — record the decision).
- [ ] Optional stretch: record a short WebM clip of the canvas via `MediaRecorder`.
- [ ] Add a **"Black book capture" script** `scripts/capture_screens.ts` (Playwright) that opens the fixture/real session at predefined moments and saves a consistent set of PNGs (race workspace, battle focus with ML chip, analysis presets, home, qualifying) into `docs/web-revamp/evidence/black-book/`.

### 3.7 Visual regression + bundle
- [ ] Lock Playwright screenshot baselines for key screens/states (fixture, fixed times). CI-style script `npm run e2e:visual`.
- [ ] Analyse the bundle (`rollup-plugin-visualizer`), remove dead dependencies and unused components (replace = delete rule applies to anything now orphaned).

## 4. Files
**Create:** soak/perf/a11y test scripts, export feature, capture script, baselines.
**Modify:** wide surface area (styles, states, lazy-loading); settings (performance/colorblind).
**Delete:** orphaned components/styles discovered in the audit.

## 5. Acceptance criteria
- [ ] AC1: Performance table filled with measured numbers; all budgets met (or deviations justified and recorded).
- [ ] AC2: Soak test passes with no console errors and flat memory.
- [ ] AC3: axe reports zero serious/critical issues on all routes/states; keyboard-only walkthrough completed (checklist in report).
- [ ] AC4: Colorblind mode verified with simulation screenshots; reduced-motion verified.
- [ ] AC5: All screens correct at the 5 viewport sizes and 2 OS scales — no overlap, no clipped controls, no horizontal scroll (bounding-box script).
- [ ] AC6: Every async boundary has loading/empty/error states; grep finds no placeholder values wired to nothing.
- [ ] AC7: Export produces correct PNGs; capture script generates the full black-book image set.
- [ ] AC8: Visual-regression baselines committed; `npm run e2e:visual` passes.
- [ ] AC9: Bundle budget met; no unused dependencies.

## 6. Verification
Perf traces, axe reports, soak output, screenshot matrices, bundle report → `evidence/phase-9/`.

## 7. Pitfalls
- Chasing FPS on a fast desktop — measure on the integrated-GPU class device.
- "Polish" that adds always-on animation or blur over the canvas — keep restraint (design principle 4).
- Fixing accessibility by hard-coding colors in components — change tokens instead.
- DOM-to-image for export can miss canvas/WebGL content; composite explicitly.

## 8. Hand-off
Phase 10 packages the polished app and removes the legacy UI.

## 9. Kickoff prompt (copy-paste)
```
You are starting Phase 9 (Polish, Performance & Accessibility) of the F1 Synapse
web revamp. Read: 00_MASTER_PLAN.md, PHASE_9_POLISH_PERF_A11Y.md, REF_DESIGN_SYSTEM.md.
Phases 3-8 are complete.

Do NOT add features or change architecture. Audit and fix: motion tokens and
reduced-motion, loading/empty/error states everywhere (no placeholder values), the
performance budgets in section 3.3 (measure and record real numbers; add a soak test),
accessibility (axe, keyboard-only, contrast via tokens, screen-reader semantics,
colorblind-safe mode), responsive behavior at the listed viewports and OS scales, the
PNG export and the black-book capture script, and visual-regression baselines. Delete
anything orphaned. Report real measured numbers, not estimates.
```
