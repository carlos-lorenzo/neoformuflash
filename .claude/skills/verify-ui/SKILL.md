---
name: verify-ui
description: Use after building or changing any user-facing screen, or when the user says "verify the UI", "check how it looks", "screenshot it". Renders the real app, captures screenshots at three widths, and routes them to the design-critic subagent.
---

# Verify UI

Code review cannot catch visual defects. This skill makes the agent *look at the thing*.

## Procedure

1. Start the dev server in the background if it is not running. Record the shell id.
2. Run the Playwright flow for the screen under review:
   `pnpm test:e2e -- --grep "<flow name>"`
   Screenshots land in `e2e/__screenshots__/<flow>/{390,768,1440}.png`.
3. Capture **every state**, not just the happy path: loaded, empty, loading skeleton, error, and the densest realistic content (a note with three display equations and a 20-row table; a deck with 200 cards).
4. Read the screenshots yourself first and note anything obvious.
5. Dispatch `design-critic` with the screenshot paths and the name of the surface.
6. Fix every **token violation** and every **blocking** finding. For taste findings, list them for the user and do not act unilaterally.
7. Re-run from step 2. Repeat at most three times. If findings persist after three passes, stop and escalate to the user with the screenshots.

## What counts as failure

- Any colour, spacing, radius, font-size or duration not in `specs/design-system.md`
- Horizontal scroll at 390px
- Any tap target under 44×44 at 390px
- Math that overflows, wraps mid-expression, or renders at a different optical size than surrounding text
- An empty state that is a blank area rather than a designed invitation
- No visible keyboard focus ring on any interactive element
- Motion that ignores `prefers-reduced-motion`

## Never

- Never declare UI verified from reading code.
- Never ask the design-critic "does this look good?" — ask it to enumerate violations. Empirical questions only.
