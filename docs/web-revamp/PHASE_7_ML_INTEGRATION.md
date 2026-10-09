# Phase 7 — ML Integration

> **Size:** L · **Depends on:** Phases 5, 6 · **Branch:** `web/phase-7-ml`

## 1. Goal
Turn the project's headline feature into a first-class part of the UI. Extract the ML feature/inference code out of the Qt window into a Qt-free module, **precompute** predictions for the whole session at load time (replay data is static — decision D4), and surface them **inline**: overtake-probability chips on the track between close cars, pit-anticipation badges in the timing tower, estimated tyre wear in the driver card, plus a dedicated ML panel with explainability.

## 2. Honesty requirement (non-negotiable)
The offline models are trained on **simulated/synthetic targets** (the black book states that public data has no ground truth for definitive overtakes). The UI must therefore:
- label every ML value as **"est."** with the `--insight` color,
- provide a **Model info** popover (model type, features, training-data caveat, version, date),
- never present probabilities as certainties (no "will overtake" wording; use "overtake likelihood").

## 3. Tasks

### 3.1 Extract ML code (Qt-free)
- [ ] Using `LEGACY_LOGIC.md`, move feature engineering + inference out of `src/insights/ml_prediction_window.py` (and any helpers) into `src/ml/` with **no PySide6/Qt imports**: `features.py`, `overtake.py`, `pit.py`, `tyre.py` (wrapping the existing Bayesian tyre model), `registry.py` (load models, expose version/metadata).
- [ ] Keep the legacy Qt window working by importing from the new module (so behaviour is identical and the extraction is verified by the old UI still producing the same numbers). If this is risky, copy first, switch the Qt window to the module, and compare outputs on fixture frames.
- [ ] Unit tests: feature vectors on fixture frames equal the legacy ring-buffer outputs (tolerance documented); model loads; deterministic outputs.

### 3.2 Precompute timelines (`src/web/services/ml_service.py`)
- [ ] Add job stage `computing_ml` after `indexing_events`. Run at ≤ 2 Hz sampling (every 0.5 s; configurable).
- [ ] **Overtake likelihood:** for each *adjacent pair* (car behind, car ahead) whenever the gap < `mlPairGapSec` (default 3.0 s) → probability series stored sparsely as `{a, b, t0, dt, p[]}` segments. (Pairs come from the server `position` channel; P1/P2 must be correct — add a regression test that the P1/P2 pair at fixed times equals the dist-sorted top two.)
- [ ] **Pit anticipation:** per driver, probability per sample (only while on track).
- [ ] **Tyre degradation:** per driver per lap from the Bayesian model: estimated degradation (s/lap), fuel-corrected pace, plus a short forward projection.
- [ ] `GET /api/sessions/{sid}/ml` returns `MlTimelines` per contract (compact arrays, `Cache-Control: immutable`) including `model: { name, version, trainedOn, note }`. Update `REF_API_CONTRACT.md` (version bump) and regenerate TS types.
- [ ] Explainability: for the current top-k pairs/drivers, store top feature contributions (LightGBM `pred_contrib` / XGBoost `pred_contribs`) sampled at the same cadence **or** compute on demand via `GET /ml/explain?kind=&a=&b=&t=` (choose one; document in `DECISIONS.md`). Cap payload size.
- [ ] Load-time budget: computing ML for a full race must finish in < 60 s on the dev machine; stream progress via SSE.

### 3.3 Frontend data layer
- [ ] `MlStore` loads `/ml` once per session into typed arrays; `getOvertake(a, b, t)`, `getPit(driver, t)`, `getTyre(driver, lap)` O(log n) lookups, interpolated, **no allocation**.
- [ ] Master toggle "Show ML insights" (default on) + per-feature toggles in `uiStore`.

### 3.4 Inline overlays
- [ ] **Track overlay (OverlayHook from Phase 3):** for each visible adjacent pair with gap < threshold and likelihood ≥ `showAbove` (default 25 %), draw a thin curved connector between the two cars with a small chip `NN% est.` in `--insight`; fade in/out (200 ms); at most 3 chips at once (highest likelihood, plus selected pair); hidden in performance mode.
- [ ] **Timing tower:** `PIT NN%` chip on rows with pit likelihood ≥ 50 %; subtle intensity ramp from 50→90 %.
- [ ] **Driver card:** tyre wear/degradation block uses the Bayesian estimate (replaces the Phase 4 tyre-life heuristic), labelled "est."; mini-chart of estimated degradation over laps with the forward projection dashed.
- [ ] **Timeline:** optional "high-likelihood moments" markers (toggle), reusing the Phase 5 marker system.

### 3.5 ML panel (replaces `ml_prediction_window`)
- [ ] Registered in the Phase 6 panel registry. **Auto-track lead battle (P2 vs P1)** by default, with attacking/defending driver pickers (parity with the legacy window) and a "follow selection" mode.
- [ ] Overtake-likelihood gauge + 60-second history sparkline; pit-anticipation gauge for the car ahead/behind; tyre age and compound line (parity with the legacy "LAW Tyre Age: 6 laps (HARD) | SC Active: False" line).
- [ ] **"Why?" drawer:** horizontal bars of top contributing features (closing speed, gap, DRS availability, tyre age delta…) with plain-English labels.
- [ ] **Model info** popover (see §2).

### 3.6 Tests
- [ ] Backend: `ml_service` output shapes/ranges (0–1, no NaN), sparse segment integrity, P1/P2 regression test, performance budget test (skippable in CI if models absent, but runnable locally).
- [ ] Frontend unit: lookups (boundaries, gaps between segments → `null`), overlay selection logic (max 3 chips, thresholds), formatting (`est.`).
- [ ] Playwright: on the fixture, a close-pair moment shows a connector + chip; toggling "Show ML insights" removes all ML UI; ML panel auto-tracks the true P1/P2 at two times.

## 4. Files
**Create:** `src/ml/**`, `src/web/services/ml_service.py`, `tests/web/test_ml_*.py`, `web/src/features/ml/**`, `web/src/render/layers/MlOverlay.ts`.
**Modify:** legacy `ml_prediction_window.py` (import from `src/ml`), job stages, schemas/contract, tower/driver-card/timeline components.
**Delete:** nothing yet (legacy window removed in Phase 10).

## 5. Acceptance criteria
- [ ] AC1: `src/ml/` contains no Qt imports (grep evidence); the legacy window still runs and shows the same numbers as before on fixture frames.
- [ ] AC2: `/ml` returns timelines for the full race within the load-time budget; all values within [0,1].
- [ ] AC3: **P1/P2 regression:** the auto-tracked battle in the ML panel equals the true top two by dist at 5 sampled times.
- [ ] AC4: Inline overlays appear for close pairs, respect thresholds/limits, and never overlap labels in a way that hides driver codes.
- [ ] AC5: Every ML value is labelled "est."; Model info popover shows the training-data caveat; no deterministic wording.
- [ ] AC6: Tyre estimate shown in the driver card matches the Bayesian model output for 3 spot-checked driver/lap pairs.
- [ ] AC7: Toggling ML off removes all ML UI instantly; performance mode disables overlays.
- [ ] AC8: No per-frame allocation in ML lookups (benchmark) and no FPS regression > 3 fps vs Phase 6 with overlays on.

## 6. Verification
pytest/Vitest/Playwright output; side-by-side legacy-vs-new numbers for AC1/AC6; screenshots (overlay on/off) → `evidence/phase-7/`.

## 7. Pitfalls
- Don't recompute inference in the browser or per frame — lookups only.
- Pairs change as order changes: key by driver codes + time segments, not by position index.
- Probability chips can clutter the canvas — enforce the 3-chip cap and fade rules.
- Keep model/feature versions in the response so cached timelines are invalidated when models change.
- Don't oversell: wording and labels per §2.

## 8. Hand-off
Phase 9 polishes overlay motion and perf. Phase 10 deletes the Qt ML window after parity is confirmed.

## 9. Kickoff prompt (copy-paste)
```
You are starting Phase 7 (ML Integration) of the F1 Synapse web revamp.
Read: 00_MASTER_PLAN.md, PHASE_7_ML_INTEGRATION.md, LEGACY_LOGIC.md (ML section),
REF_API_CONTRACT.md, REF_DESIGN_SYSTEM.md. Phases 5 and 6 are done.

1) Extract ML feature/inference code into a Qt-free src/ml/ module and make the legacy
window import from it, proving identical outputs. 2) Precompute overtake, pit and tyre
timelines at session load and serve them from /ml (update and version the contract).
3) Build inline overlays (track chips, tower PIT badges, driver-card tyre estimate), the
ML panel with auto-tracked P2-vs-P1 (add a regression test that P1/P2 equal the top two
by dist), and the "Why?" explainability drawer. Every ML number must be labelled "est."
with a model-info popover that states the synthetic-target caveat. Include evidence and
the legacy-vs-new comparison in the Phase report.
```
