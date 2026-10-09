# F1 Synapse — Web Revamp Plan

Drop this whole folder into your repo at `docs/web-revamp/`.

## What's here

| File | Purpose |
|---|---|
| `00_MASTER_PLAN.md` | Vision, architecture, decisions D1–D10, parity matrix, global agent rules, risks, progress tracker. **Read first.** |
| `REF_API_CONTRACT.md` | Backend ↔ frontend contract (draft v0.1 → verified v1.0 in Phase 0). |
| `REF_DESIGN_SYSTEM.md` | Tokens, typography, motion, components, accessibility rules. |
| `PHASE_0` … `PHASE_10` | One file per phase: goal, tasks, acceptance criteria, verification, pitfalls, and a copy-paste kickoff prompt. |

## How to run it with an AI agent

1. Put the folder in the repo (`docs/web-revamp/`).
2. Open a **fresh agent session per phase**. Paste that phase's **kickoff prompt** (last section of the phase file). It tells the agent which files to read.
3. When the agent finishes, check its **Phase report** against the phase's acceptance criteria and evidence folder. Don't accept "done" without screenshots/test output.
4. Tick the phase in the tracker at the bottom of `00_MASTER_PLAN.md`, merge the branch, start the next phase.

## Two hard gates
- **After Phase 0:** you approve the mockups (`DESIGN_APPROVED`). No frontend code before this.
- **In Phase 10:** you approve the parity matrix (`CUTOVER_APPROVED`). Nothing legacy is deleted before this.

## If time is short
Phases 0 → 5 give a complete, demo-ready race replay. Add Phase 7 for the ML headline feature. Phases 6, 8, 9, 10 can follow. The legacy app stays runnable until Phase 10.
