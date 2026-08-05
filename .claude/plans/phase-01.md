# Plan — Phase 01: Frozen contracts

## Context

Phase 00 shipped identity and taxonomy (`institutions`, `degrees`, `profiles`, `institution_requests`). Phases 02 (editor), 03 (review engine) and 04 (public profiles) are meant to run **in parallel git worktrees**, each treating `packages/contracts/**` and `supabase/migrations/**` as read-only. That parallelism only works if the schema, the RLS boundary and the TypeScript contract are frozen first. This phase produces that freeze.

Nothing here is user-visible. Everything downstream depends on it. It is the phase most likely to be rushed and the most expensive to get wrong — a mistake in `card_states` or `fork_course` is silent, surfaces months later, and costs every user their review history.

`specs/01-contracts.md` already holds the eight design decisions and a draft migration, but it predates phase 00 shipping: its SQL re-creates objects that now exist (`reject_slug_change()`, the slug trigger, the `profiles` grants), and its `anon` grants contradict its own acceptance criterion 4. This plan supersedes it.

### Decisions taken during planning

| Question | Decision |
|---|---|
| Spec file | New `specs/phase-01-contracts.md`; move the eight decisions to `specs/ADR-002-schema-decisions.md`; delete `specs/01-contracts.md`; update ROADMAP link |
| `srs.ts` / `content.ts` | **Fully implemented**, not signature-only. Adds `ts-fsrs` at an exact pinned version |
| Anonymous read of public content | **In this phase** — `anon` SELECT + public-read RLS on `courses`/`notes`/`decks`/`cards` |
| Seed | **Both** — TS fixtures for the suite *and* `scripts/seed-dev.mjs` at realistic volume |
| Enums | **Real Postgres enums**, as drafted (phase 00's text+CHECK pattern is not extended) |
| AI tables | **In.** Infrastructure present so phase 05 needs no migration; no AI feature ships |
| `apply_review` | **In this phase**, alongside the other atomic procedures |
| Deck sharing | **`deck_subscriptions` + `fork_deck` ship**, symmetric to the course versions |
| Tiptap node union | Exactly what `specs/phase-02-editor.md` promises. Nothing speculative |
| `lib/db/*` | **None.** Database and contracts only |
| FSRS fixtures | Generated from `ts-fsrs` into a committed file; exact version pin |

### Two findings from probing the running database

Both verified against local Postgres 17.6, not assumed.

1. **Supabase's default ACLs grant `TRUNCATE` to `anon` and `authenticated` on every new table in `public`** (`pg_default_acl` owner `postgres` → `Dxtm`). Confirmed executable: `set local role authenticated; truncate ...` succeeded. RLS does not apply to TRUNCATE. **It is not reachable today** — PostgREST emits only SELECT/INSERT/UPDATE/DELETE/CALL, and neither role has `CREATE` on `public` — so this is defence-in-depth, not a live hole. It costs one `revoke` per table.
2. **`tests/db/grants.test.ts` asserts a guarantee broader than it checks.** Its comment claims "authenticated writes are per-column only"; it queries INSERT/UPDATE only. DELETE cannot be column-granted in Postgres (column privileges exist for SELECT/INSERT/UPDATE/REFERENCES only), and this phase genuinely needs DELETE on four tables. Same shape as the `lint:tokens` and `assert-build-safe.mjs` incidents in `EVOLUTION.md`: a check whose coverage is narrower than its stated promise.

---

## Deliverable 1 — `specs/phase-01-contracts.md`

Written to `specs/PHASE-TEMPLATE.md` structure. Its content is specified below; writing it is mechanical once this plan is approved.

## Deliverable 2 — `specs/ADR-002-schema-decisions.md`

The eight decisions from `specs/01-contracts.md` moved verbatim (card/progress split, taxonomy as tables, dual note storage, three-value visibility, subscribe-vs-fork, immutable slugs, interface-vs-content language, content-version flagging), plus two new ones written during planning:

- **Decision 9 — deck-level sharing is symmetric to course-level.** A standalone deck (`decks.course_id is null`) is shareable in its own right; requiring a course wrapper to share one deck is friction on the most common sharing act.
- **Decision 10 — forking is one-way at every level.** `fork_course` drops the caller's `course_subscriptions` row *and* any `deck_subscriptions` rows on decks belonging to that course. Otherwise a user ends up both subscribed to deck D and owning its copy D′, and the queue shows both.

## Deliverable 3 — migrations

Five files, one concern each, so a reviewer checks one thing per file. Phase 00 established this split (`0001` structure / `0002` grants) and the security audit found four escalations living in the grants file alone.

| File | Contents |
|---|---|
| `0003_content.sql` | enums `visibility`, `card_phase`, `review_rating`, `ai_provider`; tables `courses`, `notes`, `decks`, `cards`; indexes; triggers `bump_card_content_version`, `set_updated_at`, `enforce_private_requires_pro`, slug immutability on the three new tables |
| `0004_srs.sql` | `card_states`, `review_logs`, `fsrs_parameters`, `streaks` + indexes |
| `0005_sharing.sql` | `course_subscriptions`, `deck_subscriptions`, counter triggers, and the five procedures: `subscribe_to_course`, `subscribe_to_deck`, `fork_course`, `fork_deck`, `acknowledge_card_change`, `apply_review` |
| `0006_ai.sql` | `user_api_keys`, `ai_jobs` |
| `0007_rls_and_grants.sql` | every `enable row level security`, every policy, every column grant, every revoke — including the TRUNCATE revoke and function EXECUTE revokes |

Ordering constraints that must hold: enums before the tables using them; every function before its `grant execute`; `0007` last because it references everything.

### Schema notes that differ from the `01-contracts.md` draft

- **`courses.deleted_at timestamptz`** — present in the DDL (the draft discussed it in prose but omitted it from the table).
- **`notes.updated_at`** — the draft called it "trigger-managed" but defined no trigger. Add `set_updated_at()` as a before-update trigger on `notes` and `cards`.
- **`decks`** gains `subscriber_count` / `fork_count` and `deck_subscriptions` exists (decision 9).
- **`anon` gets SELECT** on `courses`, `notes`, `decks`, `cards` — the draft granted it nothing, contradicting its own AC4.
- **No object may be named** `reject_slug_change`, `slugify`, `profile_slug_base`, `claim_profile_slug`, `create_profile`, or `profiles_slug_immutable`. All exist from phase 00. Reuse `reject_slug_change()` for the new slug triggers; do not redefine it.
- **Every `security definer` function carries `set search_path = ''`** and fully-qualifies its references, matching phase 00's hardening. Every object reference inside such a function is schema-qualified (`public.cards`, `auth.uid()`).
- **`card_states.deck_id` must be updated by both fork procedures.** It is denormalised to serve `card_states_queue_idx (user_id, deck_id, due_at)`. Re-pointing `card_id` without `deck_id` leaves the row invisible to the new deck's queue — silent, and the single most likely way to break fork.

### `fork_course` — exact order, one transaction

1. Verify source is `public` or `unlisted` and not soft-deleted; raise otherwise.
2. Deep-copy `courses` → `notes` → `decks` → `cards` under the caller. Every copy sets `source_*_id` to its origin. Slugs are regenerated in the caller's namespace.
3. Re-point the caller's `card_states`: join old→new on `source_card_id`, set `card_id` **and `deck_id`** to the new values, set `seen_version` to the copied card's `content_version`.
4. Delete the caller's `course_subscriptions` row for the source, and any `deck_subscriptions` rows on decks belonging to the source course (decision 10).
5. `fork_count + 1` on the source; decrement `subscriber_count` on the source course and on each deck whose subscription step 4 removed.
6. Return `{ course_id, states_carried }`.

`review_logs` are **never** re-pointed. History records what happened.

`fork_deck` is the same procedure at deck scope: steps 1–3, delete only the deck subscription, move the deck's counters.

`apply_review` receives **pre-computed** values — `stability`, `difficulty`, `phase`, `due_at`, plus the log fields. It does no arithmetic. The FSRS maths lives in `schedule()` in TypeScript. It upserts `card_states` and inserts `review_logs` in one statement pair.

`acknowledge_card_change(card_id, reset boolean)` sets `seen_version` to current. When `reset`, also `stability = 0`, `difficulty` to default, `phase = 'new'`, `due_at = now()`, `reps = 0` — **`lapses` is preserved** and **no `review_logs` row is written**, ever.

## Deliverable 4 — `packages/contracts/`

New files, all exported from `index.ts`. Zod error messages are **stable dot-codes**, never prose — matching `schemas.ts`, because `lint:i18n` does not reach this package.

| File | Exports |
|---|---|
| `src/srs.ts` | `SrsState`, `Rating`, `CardPhase`, `SchedulingSettings`, `FSRS6_DEFAULT_WEIGHTS`, `MAX_INTERVAL_DAYS = 365`, `LEARNING_STEPS`, and `schedule(state, rating, settings, now): { next, log }` wrapping `ts-fsrs` |
| `src/content.ts` | `NoteDoc` discriminated union — `doc`, `paragraph`, `heading` (1–3), `bulletList`, `orderedList`, `listItem`, `codeBlock`, `blockquote`, `text` with `bold`/`italic`/`code` marks, `inlineMath`, `displayMath` — plus `extractText(doc): string` |
| `src/sharing.ts` | `SubscribeInput`, `ForkInput`, `CourseLineage`, `ForkResult` (**includes `statesCarried: number`** so the UI can say what was preserved) |
| `src/schemas.ts` | *extend* with `CreateNoteInput`, `UpdateNoteInput`, `CreateDeckInput`, `CardInput`, `ReviewSubmission`, `ApiKeyInput` |
| `src/db.ts` | regenerated by `pnpm db:types` — never hand-edited |

`FSRS6_DEFAULT_WEIGHTS` is **read from `ts-fsrs` at module load, not transcribed.** Twenty-one floats is exactly where a typo produces subtly wrong scheduling that no test catches — ADR-001 §"What is wrong in the document" item 4 is this mistake, already made once in the source research.

`extractText` renders math nodes as their LaTeX source, per phase 02 AC8.

`package.json`: `ts-fsrs` pinned **exact** (no caret) in `packages/contracts`.

## Deliverable 5 — tests

| File | Covers |
|---|---|
| `tests/rls/content.test.ts` | AC 4, 7, 12, 15 — visibility matrix across `courses`/`notes`/`decks`/`cards` for owner, other user and anon; private-requires-pro |
| `tests/rls/progress.test.ts` | AC 5, 6, 16 — `card_states`/`review_logs`/`user_api_keys`/`fsrs_parameters` are strictly self-only; two users on one public deck stay independent |
| `tests/db/sharing.test.ts` | AC 8, 9, 10, 11 — subscribe idempotence, counters, fork lineage, **the 90-day progress-survival assertion**, deck-level equivalents |
| `tests/db/card-version.test.ts` | AC 13, 14 — `content_version` bumps on semantic change only; dismiss/reset behaviour; edit-then-revert |
| `tests/db/queue.test.ts` | AC 17 — `explain analyze` proves the queue query uses `card_states_queue_idx` |
| `tests/db/grants.test.ts` | **extend** — corrected invariant (below) |
| `packages/contracts/src/srs.test.ts` | AC 3 — golden fixtures |
| `packages/contracts/src/content.test.ts` | `extractText` over a document containing every node type |
| `tests/fixtures/seed.ts` | shared fixture builder used by the suites above |

### Corrected `grants.test.ts` invariant

Three assertions replacing the current one:

1. Zero table-level INSERT/UPDATE for `authenticated` in `public` — unchanged.
2. DELETE for `authenticated` appears **only** on an explicit allowlist: `course_subscriptions`, `deck_subscriptions`, `user_api_keys`, `notes`, `decks`, `cards`. Any other table having it fails.
3. Zero TRUNCATE for `anon` or `authenticated` on any table in `public` — this is what catches finding 1, and it catches it for every table added in future without anyone remembering to check.

Also add: every `security definer` function in `public` has `proconfig` containing `search_path=`. Phase 00 applies this by discipline; nothing enforces it.

### FSRS golden fixtures

`scripts/gen-fsrs-fixtures.mjs` calls `ts-fsrs` directly and emits `packages/contracts/src/__fixtures__/fsrs-golden.json`, committed. `srs.test.ts` compares `schedule()` against the committed file. A library bump that changes intervals then fails loudly instead of silently rescheduling every user. The generator is run deliberately, never as part of `pnpm test`.

## Deliverable 6 — seed

- `supabase/seed.sql` stays taxonomy-only (it cannot create `auth.users`).
- `scripts/seed-dev.mjs` — service-role script, run after `db:reset`. Two users (one pro, one free), courses, notes spanning all three visibilities, decks, cards, a subscription, and **realistic volume**: a 500-card deck, a 5,000-word note, and 90 days of review history on a subscribed deck. Phase 02's large-document AC, phase 03's queue AC and the fork-survival test all get real data.

---

## Acceptance criteria

Each is independently testable and phrased as observable behaviour.

1. `supabase db reset` applies every migration cleanly from empty, and `pnpm db:types` then produces a `db.ts` that typechecks with zero errors.
2. `scripts/seed-dev.mjs` populates a local database a developer can browse: two users, both visibility extremes, a 500-card deck and 90 days of history.
3. A fixed rating sequence (Good, Good, Again, Good, Easy) through `schedule()` produces intervals identical to the committed `ts-fsrs` fixtures.
4. An anonymous visitor can read a public note; cannot read a private one; can read an unlisted one only when holding its id.
5. User A cannot read user B's `card_states`, `review_logs`, `user_api_keys` or `fsrs_parameters` under any query.
6. Two users reviewing the same public deck maintain independent progress. Neither can see the other's.
7. A free user cannot set `visibility = 'private'`; the attempt fails at the database.
8. Subscribing twice does not double-count. Unsubscribing restores the count.
9. A subscriber sees the author's later edits to a note without acting; a forker does not.
10. **A user with 90 days of review history on a subscribed deck forks it and loses nothing.** `stability`, `difficulty`, `due_at` and `lapses` survive row-for-row, matched through `source_card_id` — **and every carried row's `deck_id` points at the forked deck**, so the queue finds them.
11. Forking cancels the subscription (course-level and deck-level) and moves both counters.
12. Forking or subscribing to a private course fails at the database, not the app.
13. Editing a card's `front_text` flags subscribers; changing only formatting, reordering, or edit-then-revert does not.
14. A subscriber sees one flag per changed card. Dismissing does not re-flag next session. Resetting returns the card to new, preserves `lapses`, and writes no `review_logs` row.
15. `update ... set slug = ...` raises on `profiles`, `courses` and published `notes`. `handle`, `display_name` and `title` update freely.
16. Submitting a review writes `card_states` and `review_logs` atomically — a failure leaves neither.
17. The queue query for "cards due for user U in deck D" uses `card_states_queue_idx`, proven by `explain analyze`.
18. No table in `public` grants TRUNCATE to `anon` or `authenticated`; DELETE appears only on the allowlist; no table-level INSERT/UPDATE exists for `authenticated`.

## Verification

```bash
pnpm typecheck && pnpm lint && pnpm build
pnpm db:reset && pnpm db:types
pnpm test          # unit: srs golden fixtures, content extractText, i18n
pnpm test:rls      # rls + db: content, progress, sharing, card-version, queue, grants
node scripts/seed-dev.mjs
```

No Playwright flows and no screenshots — this phase renders nothing. Reviewers: **test-runner**, **code-reviewer**, **security-auditor** (RLS, key storage and the anonymous-read boundary are all in scope). Not design-critic.

## Files I may touch

`packages/contracts/**`, `supabase/migrations/0003_*.sql` … `0007_*.sql`, `supabase/seed.sql`, `scripts/seed-dev.mjs`, `scripts/gen-fsrs-fixtures.mjs`, `tests/**`, `specs/phase-01-contracts.md`, `specs/ADR-002-schema-decisions.md`, `specs/01-contracts.md` (delete), `specs/ROADMAP.md` (link only), root `package.json` (scripts + `ts-fsrs`), `vitest.config.ts` (if a new include path is needed).

**Not** `app/**`, **not** `components/**`, **not** `lib/**`. If this phase appears to need any of those, stop and ask.

## Risks and open questions

- **Fork correctness is the whole phase.** AC10 is the one most likely to be quietly broken and least likely to be noticed. Write it before `fork_course` exists, watch it fail, then make it pass.
- **`card_states.deck_id` staleness** is the specific mechanism by which AC10 breaks while looking fine — the rows are there, the queue just cannot see them. AC10 asserts `deck_id` explicitly for this reason.
- **`fork_course` is a large `security definer` function.** It bypasses the caller's RLS by design. Every id it touches must be re-derived from the source rows, never taken from a parameter.
- **Migration count.** Five files is more than phase 00's two. If review finds the boundaries arbitrary, collapsing `0004`/`0006` into `0003` is the cheapest change and costs nothing else.
- **Open:** the reserved-slug denylist in `profile_slug_base` guards profile slugs. Course and note slugs are namespaced per-owner (`unique (owner_id, slug)`), so squatting is not possible — but a course slugged `settings` under a public profile URL could still collide with a future route. Phase 04 owns public URL structure; flagging it here rather than deciding it.

---

## Execution guideline for a delegated implementer

Written so a cheaper model can execute this without further judgment calls. Follow in order; do not reorder.

**Ground rules**

- Read `specs/phase-01-contracts.md` before writing anything. It is the contract; this plan is the reasoning behind it.
- Touch only the paths in "Files I may touch". Anything else: stop and ask.
- No `any`. No `@ts-expect-error`. Errors surface via typed `Result` (`lib/result.ts`), never thrown strings.
- Never edit a contract or a migration to make a test pass. If a test and the schema disagree, the test is describing a real defect until proven otherwise.
- Every `security definer` function gets `set search_path = ''` and schema-qualifies every reference. No exceptions.
- Do not advance a step until its verification passes.

**Order**

1. **ADR + spec.** Write `specs/ADR-002-schema-decisions.md` (eight decisions moved verbatim from `specs/01-contracts.md`, plus decisions 9 and 10 above). Write `specs/phase-01-contracts.md` to `PHASE-TEMPLATE.md` structure using the content in this plan. Delete `specs/01-contracts.md`. Update the `specs/ROADMAP.md` row for phase 01 to point at the new filename. Verify: `rg -n '01-contracts' specs/ .claude/` returns nothing but the ADR's own history note.
2. **`0003_content.sql`.** Enums, then `courses`, `notes`, `decks`, `cards`, then indexes, then triggers. Reuse the existing `reject_slug_change()`; do not redefine it. Verify: `pnpm db:reset` succeeds.
3. **`0004_srs.sql`**, then **`0006_ai.sql`**. Tables and indexes only, no policies. Verify: `pnpm db:reset` after each.
4. **`0005_sharing.sql`.** Subscription tables and counter triggers first, then the procedures. Write `fork_course` last and follow its six steps literally. Verify: `pnpm db:reset`.
5. **`0007_rls_and_grants.sql`.** `enable row level security` on every new table; policies per the pattern in `ADR-002`; column grants for INSERT/UPDATE; table DELETE only on the six allowlisted tables; `revoke truncate on <each new table> from anon, authenticated`; `revoke execute ... from public` then `grant execute ... to authenticated, service_role` for each procedure. Verify: `pnpm db:reset && pnpm db:types && pnpm typecheck`.
6. **Contracts package.** Add `ts-fsrs` at an exact version. Write `src/content.ts`, then `src/srs.ts` (read the weight vector from `ts-fsrs`, never type it out), then `src/sharing.ts`, then extend `src/schemas.ts`. Export everything from `index.ts`. Verify: `pnpm typecheck`.
7. **Fixtures + unit tests.** `scripts/gen-fsrs-fixtures.mjs`, run once, commit the JSON. Then `srs.test.ts` and `content.test.ts`. Verify: `pnpm test`.
8. **Database tests.** `tests/fixtures/seed.ts` first, then `content` → `progress` → `card-version` → `queue` → `sharing`. Write `sharing.test.ts`'s AC10 assertion and watch it fail before trusting it. Extend `grants.test.ts` with the three corrected assertions plus the `search_path` check. Verify: `pnpm test:rls`.
9. **Dev seed.** `scripts/seed-dev.mjs`. Verify: `pnpm db:reset && node scripts/seed-dev.mjs`, then confirm row counts in Studio.
10. **Gate.** `pnpm typecheck && pnpm lint && pnpm build && pnpm test && pnpm test:rls`, all green, zero warnings. Then hand to `code-reviewer` and `security-auditor`. Then `ship-phase`.

**If you get stuck:** the three places this phase is genuinely hard are `fork_course` step 3 (the `card_states` re-point, including `deck_id`), the RLS policy on `cards` (it must inherit deck visibility via an `exists` subquery, not duplicate the column), and the queue's lazy-union query. Everything else is mechanical. Stop and ask rather than improvising in those three.
