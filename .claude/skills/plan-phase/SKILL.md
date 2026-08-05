---
name: plan-phase
description: Use when starting a new phase of work, or when the user says "plan phase N", "write the spec", "grill me", or asks to build something that has no spec in specs/. Produces a complete, contract-first phase spec through interrogation before any code is written.
---

# Plan a phase

You are writing the document that lets a fresh agent build this phase with almost no ambiguity. The plan is what earns the right to delegate. Take as long as it needs.

## Step 1 — Load context (do not skip)

Read: `specs/design-system.md`, `packages/contracts/README.md`, `specs/ROADMAP.md`, the previous phase spec, and any contracts about that phase if they exist.
Then dispatch `explorer` to map the parts of the codebase this phase will touch. Do not read the codebase yourself.

## Step 2 — Interrogate

Ask the user questions until you are 95% confident. Be adversarial about your own assumptions. Cover at minimum:

- What does *done* mean for a user, in a sentence they would recognise?
- What is explicitly **not** in this phase?
- Which existing behaviour must not regress?
- What is the riskiest unknown here, and what is the cheapest way to find out?
- Where could this reasonably be built two different ways, and which does the user want?

Ask in batches. Never more than four at a time. State your current best guess next to each question so the user can just correct you rather than write an essay.

## Step 3 — Write `specs/phase-NN-<slug>.md`

Use this exact structure. A section with nothing in it says "none", never omitted.

```
# Phase NN — <name>

## Goal and why
## Not in this phase
## Contract changes
   - migration SQL (exact)
   - Zod schemas / TS types added or changed
   - "no contract change" if none
## Routes and server actions
   - path · method · input type · output type · auth requirement
## Component inventory
   - name · file path · props · client or server · states it must handle (loading, empty, error, dense, mobile)
## Acceptance criteria
   - numbered, each independently testable, phrased as observable user-facing behaviour
## Verification
   - the exact commands to run
   - the exact Playwright flows to add, by name
   - which subagents review this phase
## Files I may touch
   - explicit paths or globs. Anything else requires stopping and asking.
## Risks and open questions
```

## Step 4 — Self-critique before handing over

Reread the spec and answer honestly: could a competent developer who has never seen this project build it from this document alone, without asking you anything? Name every place the answer is no, and fix those places. Then present the spec.

## Hard rules

- No code in this skill. Not one line. If you are tempted to write an implementation, the spec is not detailed enough yet.
- Acceptance criteria are user-facing behaviour, never "function X exists".
- If the phase cannot be verified automatically, say so loudly and propose a smaller phase that can.
