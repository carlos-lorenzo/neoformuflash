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

**The design-critic calibration check.** Once, deliberately ship a screen with three token violations you introduced on purpose — a hardcoded hex, a 13px gap, a 300ms transition. If the critic misses any of them, its prompt is not working and the whole UI verification story is theatre. Do this at the end of phase 00, before you rely on it. **Run and recorded — see "Calibration result" below.**

## Calibration result — 2026-08-04, end of phase 00

Three violations planted, one per surface, on a green baseline. Answer key kept outside the repo.
The critic was dispatched blind, with one addition to the standard `verify-ui` call: *for each
finding, state where you observed it.*

| # | Plant | Observable in a static PNG? | Result |
|---|---|---|---|
| 1 | `/login` card `bg-raised` → inline `#2E333B` | yes | **caught** |
| 2 | `/onboarding` field gap 16px → inline `13px` | marginally | **missed** |
| 3 | `/app` sidebar toggle `80ms` → inline `300ms` | no — hallucination probe | **correctly not reported** |

False positives: zero. Two further items were raised and correctly labelled as observations rather
than findings.

**Plant 1 was caught well, and the method matters more than the result.** The critic did not
eyeball it — it scripted a read of the raw RGB out of the PNGs, independently converted every
OKLCH token in §1 to sRGB, and compared numerically. It reported the card sampling to `(46,51,59)`
in *both* themes, matching no token, and cross-checked against the onboarding card, which matched
`--bg-raised` exactly in both. That is a real measurement, and it is now prescribed in the agent
prompt rather than left to chance.

**Plant 2 was missed, and the critic said so unprompted:** "spacing/gap values against the 4px
grid — I did not pixel-measure gaps anywhere." Confirms suspicion #1 below. Acted on by removing
4px-grid conformance from the critic's remit entirely — see below.

**Plant 3 is the important one.** The critic did not report it, *and* volunteered that duration,
easing, reduced-motion and focus rings are outside what a still image can prove. Compare the
previous run, which returned zero findings while asserting "all spacing appears on 4px grid" and
"no hex/rgb visible" — claims the token lint proves and a screenshot cannot.

But the honesty is only partly to the agent's credit: it reported provenance **because the
dispatch asked for it**. So the requirement moved into `.claude/agents/design-critic.md` — say how
you know, list what you did not check, and never assert an absence you cannot observe. A quality
that depends on the caller remembering to ask is not a property of the system.

The critic also disclosed that its pass was **incomplete** (login exhaustive, the other three
partial). The earlier zero-findings run was very likely incomplete in the same way and did not
say so. A coverage-honesty rule went into the prompt alongside the rest.

### The finding the calibration did not set out to make

`lint:tokens` caught **1 of the 3 plants**, not 3. `scripts/lint-tokens.mjs` ran its raw-pixel and
raw-duration checks on `.css` files only, so `style={{ gap: '13px' }}` and `style={{
transitionDuration: '300ms' }}` in a `.tsx` were entirely unguarded — while the script's own header
claimed inline styles were covered. Two compounding causes:

- `off-grid-px` and `raw-duration` were the only two rules missing from `expectedRules` in
  `scripts/lint-tokens.test.ts`. They were the only two that were silently CSS-only. A rule with
  no test is a rule that can stop matching without anyone noticing.
- `scripts/__fixtures__/violations.tsx` asserted in its own header that all three calibration
  plants were caught mechanically — but only exercised the Tailwind class form (`gap-[13px]`,
  `duration-300`). The fixture manufactured confidence in a guarantee that did not exist.

Both fixed; the fixture now carries each violation in both syntaxes plus one reached through a
variable, and the checks run on every file type.

### Verdict

The critic is trustworthy for **colour and theme correctness**, which is its highest-value job and
the one that caught the real 2.15:1 contrast bug in phase 00. It is not a spacing instrument and
no longer claims to be. It does not hallucinate motion — but its restraint had to be moved from
the caller into the prompt to count.

Net: keep the critic, narrowed. The bigger lesson runs the other way from the one this section was
written to test. The question was whether the *critic* was theatre; the answer is that it is
roughly as good as suspected, while the mechanism it was being measured against had a hole in it
that nothing else would have found. **Calibrating the checker found a bug in the guarantee.** Do
this for `lint:i18n`, `lint:contrast` and the RLS suite too, before trusting any of them the way
phase 00 trusted `lint:tokens`.

## What I am least confident about

Stated openly so you can watch these specifically:

1. **That `design-critic` catches subtle spacing problems.** Screenshot review catches gross violations reliably; 4px rhythm errors, less so. The token lint is doing more of the real work than the critic is. If the calibration check above fails, lean harder on `lint:tokens` and treat the critic as a taste second opinion only.
2. **That three parallel worktrees are workable on Pro.** I have already revised this down to two in `COST-ROUTING.md`. Treat it as unproven.
3. **That the phase sizing is right.** Phase 02 may be too large for one session even with a good spec. If it needs more than three context resets, split it: math nodes first, then slash menu and palette.
4. **That six subagents is the right number.** The literature says 2–8. I would not be surprised if `doc-syncer` and `explorer` both fail the three-invocation test and get deleted by phase 03.
