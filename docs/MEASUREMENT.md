# Proving this setup is actually optimal

You asked for a way to verify my recommendations rather than take them on faith. That is the right instinct — most of what circulates about agent orchestration is untested folklore, including some of what informs this setup. Here is how to find out which parts are real.

## The one experiment that matters

**Build phase 03 (the review engine) twice.**

- **Arm A — control.** Fresh clone, no `.claude/` directory, no specs. One session. Prompt: the phase description from `ROADMAP.md`, one paragraph. Let it run the way most people use Claude Code.
- **Arm B — this system.** `plan-phase` → implement → `verify-ui` → `ship-phase`.

Phase 03 is the right choice: self-contained, algorithmically checkable (SM-2 has correct answers), and has a UI, so it exercises both code and design verification.

Record for each arm:

| Metric | How |
|---|---|
| Wall-clock to "I'd merge this" | stopwatch |
| Sessions / context resets needed | count |
| Human interventions (corrections, redirections) | tally marks, honestly |
| Acceptance criteria met on first attempt | n/11 |
| Bugs found in the adversarial pass afterwards | count, severity |
| Token spend | `/cost`, plus `.claude/cost-log.csv` |

**Interpretation, decided in advance so you cannot rationalise afterwards:**

- Arm B costs more tokens. That is certain and not a failure — the question is what you bought.
- If Arm B does not clearly win on *interventions* and *first-attempt criteria met*, the scaffolding is overhead and we cut it back to CLAUDE.md + design-system.md + Playwright.
- If Arm B wins on those but not on wall-clock, keep it anyway. Your scarce resource is attention, not clock time.

Do this once, early. It costs you a day and it tells you whether to trust the next three months of process.

## Ongoing signals

**Per-agent utilisation.** At the end of each phase, count invocations per subagent. Under three in a phase → delete it. An agent that does not fire is not neutral; it dilutes routing for the ones that do.

**Rework rate.** Count how many acceptance criteria needed a second implementation pass. If this is not falling across phases 02 → 03 → 04, the specs are not improving and `plan-phase` needs work.

**The EVOLUTION.md test.** If that file is empty after a month, one of two things is true: nothing is going wrong (implausible), or the `evolve` step is being skipped (likely). An empty ledger is a red flag about the process, not a green light about the code.

**CLAUDE.md drift.** Every time you add a line, ask whether a test could enforce it instead. A rule the model sometimes ignores is worse than no rule, because it creates false confidence. Target: `CLAUDE.md` should *shrink* over the project as rules get replaced by lint rules and tests.

**The design-critic calibration check.** Once, deliberately ship a screen with three token violations you introduced on purpose — a hardcoded hex, a 13px gap, a 300ms transition. If the critic misses any of them, its prompt is not working and the whole UI verification story is theatre. Do this at the end of phase 00, before you rely on it.

## What I am least confident about

Stated openly so you can watch these specifically:

1. **That `design-critic` catches subtle spacing problems.** Screenshot review catches gross violations reliably; 4px rhythm errors, less so. The token lint is doing more of the real work than the critic is. If the calibration check above fails, lean harder on `lint:tokens` and treat the critic as a taste second opinion only.
2. **That three parallel worktrees are workable on Pro.** I have already revised this down to two in `COST-ROUTING.md`. Treat it as unproven.
3. **That the phase sizing is right.** Phase 02 may be too large for one session even with a good spec. If it needs more than three context resets, split it: math nodes first, then slash menu and palette.
4. **That six subagents is the right number.** The literature says 2–8. I would not be surprised if `doc-syncer` and `explorer` both fail the three-invocation test and get deleted by phase 03.
