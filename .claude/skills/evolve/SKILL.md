---
name: evolve
description: Use after any bug reaches the user, any rework loop, or at the end of a phase, and when the user says "evolve", "what did we learn", "update the system". Converts a failure into a permanent improvement to the AI layer.
---

# Evolve the system

Every problem that reached the user is a defect in the system, not just in the code. Fix the system.

## Procedure

1. Name the failure in one sentence: what went wrong, and what the user had to catch.
2. Ask: **at which layer should this have been caught?**
   - Spec was ambiguous → the fix goes in `plan-phase/SKILL.md` or the spec template
   - Agent lacked a rule it needed every time → the fix goes in `CLAUDE.md`
   - Verification did not cover it → the fix goes in `verify-ui` or a new Playwright assertion
   - Design was wrong, not the code → the fix goes in `specs/design-system.md`
   - Wrong agent was used, or none was → the fix goes in that agent's `description`
3. Make exactly one change at the right layer. Not three changes at three layers.
4. Append one line to `specs/EVOLUTION.md`:
   `YYYY-MM-DD · <failure> · <layer> · <change made>`

## Rules

- One line per incident. This is a ledger, not a retrospective.
- Prefer a verification check over a written rule. A rule is a hope; a test is a guarantee.
- If `CLAUDE.md` passes ~250 lines, do not add to it — propose deleting it and rebuilding from what is actually load-bearing.
- If a subagent has been invoked fewer than three times in the last phase, propose deleting it.
