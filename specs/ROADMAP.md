# Roadmap — phases, dependencies, parallelism

Each phase = one branch = one worktree = one or more focused sessions. A phase closes through the `ship-phase` skill and nothing else.

## Dependency graph

```
00 foundation
      |
01 contracts  (the gate — nothing parallel before this)
      |
      +-------------------+-------------------+
      |                   |                   |
02 editor            03 review engine    04 profiles + SEO
      |                   |                   |
      +---------+---------+                   |
                |                             |
          05 AI layer                    06 monetization
                |                             |
                +--------------+--------------+
                               |
                        07 hardening + launch
```

02, 03 and 04 run in parallel worktrees. 05 needs the editor's content model. 06 needs the public surfaces. 07 is last and alone.

## Phases

| # | Name | Spec | Parallel with | Ship when |
|---|---|---|---|---|
| 00 | Foundation | `phase-00-foundation.md` | — | App boots, Google auth works, tokens render, Playwright captures a screenshot, CI is green |
| 01 | Contracts | `01-contracts.md` | — | Migrations apply, RLS suite passes, types generate |
| 02 | Editor | `phase-02-editor.md` | 03, 04 | A student can write a note with headings, lists, inline and display LaTeX, and it survives a reload |
| 03 | Review engine | *(write with `plan-phase`)* — read `ADR-001-spaced-repetition.md` first | 02, 04 | A student can review a deck to completion on a phone, grade cards, and get intervals identical to the `ts-fsrs` reference for the same rating sequence |
| 04 | Profiles + public notes + SEO | *(write with `plan-phase`)* | 02, 03 | A shared link renders a public note fast, with correct OG tags and no private data reachable |
| 05 | AI layer | *(write with `plan-phase`)* | — | BYOK key stored encrypted; all three call types return valid structured output; failures degrade gracefully to the no-AI path |
| 06 | Monetization | *(write with `plan-phase`)* | — | Paid tier gates private notes and pooled key; ads appear only on passive surfaces; review route provably ad-free |
| 07 | Hardening + launch | *(write with `plan-phase`)* | — | Security audit clean, Lighthouse ≥ 90 on public notes, error tracking live |

Write each spec with the `plan-phase` skill **immediately before** starting that phase, not now. Writing phase 06's spec today would be guessing at decisions that phases 02–05 will make for you. Phases 00, 01 and 02 are written now because they are the ones that constrain everything else.

## Worktree protocol

```bash
git worktree add ../studyapp-p02 -b phase-02-editor
git worktree add ../studyapp-p03 -b phase-03-review
git worktree add ../studyapp-p04 -b phase-04-profiles
```

One Claude Code session per worktree, each with its own terminal. Rules:

1. **A session may only touch files in its spec's allowlist.** This is what makes the parallelism safe; enforce it in review.
2. **`packages/contracts/` is read-only in every worktree.** A contract change means stopping all three sessions, changing it on `main`, and rebasing.
3. **Shared UI primitives** (button, input, dialog) are built in phase 00, not invented per-worktree. If a worktree needs a new primitive, it stops and asks.
4. Merge order is 04 → 03 → 02 (least to most file churn), rebasing each on the previous.
5. Three concurrent worktrees is the ceiling for one person reviewing merges. Two is more comfortable.

## Cadence per phase

```
plan-phase (interrogation → spec)      you + one session, plan mode
  → implement                          one session per worktree
  → verify-ui + test-runner            loop until clean
  → ship-phase                         the gate
  → adversarial pass                   a fresh, hostile session
  → session-handoff → /clear
  → evolve                             one line in EVOLUTION.md
```
