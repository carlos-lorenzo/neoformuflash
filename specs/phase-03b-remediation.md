# Phase 03b — Remediation

**Status:** written 2026-08-08, after hands-on use of the merged phase 03 (`28d7e5a`).
**Supersedes:** parts of `specs/phase-03-review-engine.md` (see *Relationship to phase 03*).
**Amends:** `specs/shortcuts.md` (card-editor bindings), `specs/ADR-002-schema-decisions.md` (decision 11).

## Goal and why

Phase 03 merged with eight user-visible defects and four more that were invisible because
nothing tested them. Every one shipped past a green `typecheck && lint && build`.

That is the point of this phase. The defects are individually small — a missing deps entry,
a CSS block that was never written, a label passed to the wrong namespace. What they have in
common is `specs/EVOLUTION.md`'s most-repeated finding, now on its fourth and fifth instance:

> **a check that only tests what already exists is a green suite over an open hole.**

- `scripts/lint-i18n.mjs` detects hardcoded literals and **never verifies a key resolves**.
- Tailwind v4's `--container-*: initial` reset makes `max-w-3xl` emit *no CSS* rather than an
  error; `lint:tokens` only guards the stock palette/font/radius families, and its own header
  says so.
- No test ever mounted `useShortcut` and dispatched a real key event.
- No test ever passed a non-null `course_id`, so RLS policies written in phase 01 have never
  been executed even once.

So this phase fixes the defects **and** closes the four measurement gaps, landing the checks
*first and failing*. It also lights up the dormant `courses` table as a required, course-first
hierarchy, with deletion — which phase 01 deferred and which becomes load-bearing the moment
the hierarchy is mandatory.

## Not in this phase

- **Sharing UI** — subscribe/fork buttons, browsing others' courses, the live-vs-detached
  choice. Still phase 04. This phase builds the *deletion* mechanism and the DB guarantee that
  protects subscribers; the buttons that create subscribers come later. The guarantee is
  enforced in the database from day one regardless of when the UI lands.
- **AI generation** (phase 05), **profile-level retention settings**, **drag reordering**,
  **card search**, **import/export**, **per-user confidence** — all as deferred in phase 03.
- **Moving `note-editor.tsx` onto the shared editor component.** It adopts the shared extension
  builder only. See *The shared editor* for why.
- **An `errcode` taxonomy migration** for `enforce_private_requires_pro`. Recorded as a
  follow-up in *Risks*.

---

## Relationship to phase 03

`specs/phase-03-review-engine.md` stays the record of what phase 03 intended. This phase
supersedes it in four places:

1. **Allowlist.** Phase 03 banned `components/ui/**` and marked `components/editor/**`
   import-only. 03b grants both, plus `lib/shortcuts/**`, `styles/globals.css` and `scripts/**`.
2. **Migration numbering.** The phase-03 spec names `0009_review_engine.sql`; it actually
   landed as `0010_review_engine.sql` (`0009` is `0009_keyboard_shortcuts.sql`). 03b's
   migration is `0011_courses.sql`.
3. **Courses.** Phase 03 listed "courses UI" as out of scope. It is in scope here.
4. **Acceptance criteria 7, 8, 9, 10, 12, 13, 14, 15** were accepted without e2e coverage
   (`e2e/decks/` does not exist; `e2e/review/` has 3 files). Several were passing against
   hardcoded constants. 03b re-proves them.

---

## Root causes

All verified in the working tree at `28d7e5a`. Line numbers are from that commit.

| # | Symptom | Root cause |
|---|---|---|
| **A** | `MISSING_MESSAGE: gradeHard`, `gradeGood`, `endSession`, … | Two distinct bugs. (1) `review-session.tsx:111-149` passes `useShortcut` labels as **bare** strings (`'gradeHard'`); `shortcut-overlay.tsx:30` binds a **root** `t`, so it resolves top-level `gradeHard`. Convention everywhere else (`global-shortcuts.tsx:25-46`) is `'shortcuts.goHome'`. (2) ~10 sites call `t('common.close')` under `useTranslations('review')` → resolves `review.common.close`. Also `deck-list-row.tsx:34-50` registers 5 shortcuts with **no label**, rendering blank overlay rows. |
| **B** | `1`–`4`, `e`, `Esc` do nothing | `use-shortcut.ts:30-48` excludes `onPress` from the effect deps (eslint-disable at `:47`). The registered closure freezes at mount with `phase='front'`, `queue=[]`, `undoStack=[]`, so `if (phase === 'grading')` is **permanently false**. The comment at `:45-46` is true of `keys`/`scope`/`label` but false of `onPress`. Separately `provider.tsx:151` returns early for *any* unmodified key in an editable target, so bare `Escape` never reaches a binding. |
| **C** | Text barely readable, poor margins, doesn't match `refs/` | **`.note-doc-view` has zero CSS anywhere in `styles/`**, while `.tiptap` has a complete 118-line typography block at `globals.css:345-462`. Tailwind preflight strips UA margins, so every card renders as undifferentiated 14px sans with no spacing. Compounded by defect 2 below. |
| **D** | Card editor clunky, no keyboard flow | `card-editor.tsx` registers **zero** shortcuts and pushes **no** scope — no `useActiveScope`, no `useShortcut`, no ⌘Enter, no Esc, no save-and-new. `position` hardcoded to `0` at `:122`, so `listCards`' `.order('position')` has no tiebreaker and list order is nondeterministic between reads. |
| **E** | No way to see answers in a list | `card-list-client.tsx:88` renders only `frontText`. `CardSummary` (`lib/db/cards.ts:24-32`) **already carries `backJson`** and `listCards` already selects it — the data is on the wire and discarded. |
| **F** | Can't edit a card from the study view | `InlineEditOverlay` **exists and is already wired** (`review-session.tsx:224`). It is unreachable because `e` is dead (B) and its i18n is broken (A). |
| **G** | "Cards render markdown, not LaTeX" | **The premise is partly false and the record should say so: there is no Markdown anywhere in this codebase.** `note-doc-view.tsx` renders the frozen `NoteDoc` union and already calls `katex.renderToString` (`:54`, `:127`). Two real defects underneath the impression: (G1) KaTeX CSS reaches the review route only *transitively*, via `review-session.tsx:17` → `InlineEditOverlay` → `katex-client`; any other consumer renders unstyled. (G2) `card-editor.tsx:36-37` and `inline-edit-overlay.tsx:20-21` register the math extensions and provide **no way to invoke them** — no ⌘M, no `$`, no `MathInput` mount. Loaded and unreachable. |
| **H** | Data not structured in courses | `courses` is **fully built** in `0003_content.sql` — owner, institution, degree, slug, visibility, fork lineage, counters, `deleted_at`. RLS in `0007` covers it, and `decks_insert_own`/`notes_insert_own` **already require** a supplied `course_id` be caller-owned. `CreateDeckInput.courseId` already exists in Zod. It is 100% dormant: `lib/db/decks.ts:266` and `notes.ts:154` hardcode `course_id: null`; there is no `lib/db/courses.ts` and no route. |

### Four additional defects, found while investigating the eight

1. **The session completes after every single card.** `app/(review)/review/[deckId]/actions.ts:73`
   hardcodes `queue: []` and `reviewedCount: 1`. `review-session.tsx:103` checks
   `res.value.queue && res.value.queue.length === 0` — `[]` is truthy *and* has length 0, so
   `sessionComplete` fires on every grade and the summary always reads "Reviewed 1 cards".
   **This blocks every review e2e**: a test asserting "the next card appears" races a spurious
   completion screen, fails intermittently, and gets marked flaky rather than diagnosed.
   Also `setGradingInFlight(true)` at `:71` runs *before* the `!current` guard at `:73`, so an
   empty queue permanently locks the grading row.
2. **14 classes compile to nothing.** `--container-*: initial` (`globals.css:145`) deletes
   Tailwind's container scale exactly as intended — but authors kept writing it and nothing
   failed: `max-w-3xl` ×3 (deck detail and both card pages are **full-bleed at 1440px**),
   `max-w-2xl` (`flashcard-card.tsx:21` — the review card has **no width cap**, violating
   design-system §7 directly), `max-w-sm` ×3, `max-w-lg`, `min-h-touch` (a phantom 44px
   guarantee in `auth-shell.tsx`). Meanwhile `--container-review: 640px` exists at
   `globals.css:148` and is used by **nobody**. This is most of "poor margins".
3. **`NoteDocView` wraps block elements in `<span>`** (`:99`, `:110`, `:120`, `:160`).
   `<span><p>…</p></span>` is invalid; the parser reparents the `<p>` out of the `<span>`.
   Adding a `.note-doc-view` typography block on top of this produces *differently* wrong
   output, not right output — so C2 must land with C1.
4. **`editedDuringReview` is hardcoded `false`** (`actions.ts:59`) and `changedCardOpen` is
   never set true anywhere. Phase-03 acceptance criteria 10, 11 and 12 are **recorded as
   passing against constants**. Same shape as the phase-01 `seen_version` bug that `0008` fixed.

---

## Contract changes

Two, both approved in the planning session.

### 1. `packages/contracts/src/schemas.ts` — `CreateCourseInput` / `UpdateCourseInput`

A **contracts change with no migration** — a category this project has not hit before. Every
table, policy, FK and column grant courses needs already exists in `0003`/`0007`.
`CreateDeckInput.courseId` and `CreateNoteInput.courseId` already exist. What is missing is a
schema for creating a *course*. Nothing to migrate, nothing to roll back, `pnpm db:types`
output unchanged by this half.

Reuse the file's existing `Visibility` and `ContentLanguage` locals. Error messages are
catalog keys, never prose — the file header says why.

### 2. `supabase/migrations/0011_courses.sql` — course deletion with auto-fork

See *Course deletion* below for the design. `packages/contracts/src/db.ts` is regenerated
(`pnpm db:types`).

---

## Course hierarchy (H)

**Course-first and required**, per the planning decision.

- `lib/db/courses.ts` (new) — `listCourses`, `getCourse`, `createCourseRow`, `updateCourseRow`,
  `deleteCourseRow`. Follows `createDeckRow` (`lib/db/decks.ts:242-282`) exactly: `rpc('slugify')`
  + 8-hex `crypto.randomUUID()` suffix + 3-attempt retry on `23505`. Returns `Result<T>`.
- Routes `app/app/courses/{page,new,[id]}`. Components in `components/courses/`, reusing
  `EmptyState`, `Input`, `Select`, `Button`, `Dialog` from `components/ui/**`. **No new `ui`
  primitives** — ROADMAP rule 3 says a phase needing one stops and asks.
- `CoursePicker` becomes a required field on `DeckForm` and the note-create path, with an
  inline "create a course" escape hatch so first run is not a dead end.
- `g` `c` is **already in the frozen registry** (`shortcuts.md:23`) and needs only registering
  in `shortcut-manager.tsx`'s `gSecondKeyMap`. No amendment.
- `app-shell.tsx` has **two** nav lists (desktop `:62-72`, mobile `:90-104`). Keep them in sync.

> **Course-first is a UX affordance, not a DB invariant.** `decks.course_id` stays **nullable**.
> No backfill, no `NOT NULL`. ADR-002 §9 deliberately makes a standalone deck first-class —
> "requiring a course wrapper to share one deck is friction on the most common sharing act" —
> and `fork_deck` *creates* orphans by design (`0008`: `values (v_user_id, null, null, …)`).
> A future reader tidying up by adding `NOT NULL` would break forking. Existing orphan decks
> must remain listable and openable; there is an e2e for exactly this.

---

## Course deletion (ADR-002 decision 11)

The user asked for: subscribers hold a **live reference** that tracks the author's edits;
forkers hold a **detached copy** that does not; and if the author deletes the course,
subscribers are **auto-forked** so nothing is lost — then they may delete their copy freely.

`courses` currently has **no DELETE policy and no DELETE grant** (`0007:32`), and `deleted_at`
is not in the UPDATE grant either — so neither hard nor soft delete is reachable today.
ADR-002 defers this to phase 06; making the hierarchy mandatory promotes it from cosmetic to
blocking, so 03b takes it.

### Decisions

- **Hard delete, auto-fork first.** A real DELETE policy + grant. The forked copy is genuinely
  the subscriber's, theirs to delete in turn.
- **Only subscribers with progress are forked** — users with `card_states` on the course's
  cards. A subscriber with zero progress has nothing to preserve and does not want an unasked-for
  course in their library; their subscription is simply dropped.

### The mechanism, and why this shape

`0008` installed `decks_protect_subscriber_progress`, a BEFORE DELETE trigger that **blocks**
deleting any deck where a user other than the owner holds `card_states`. That trigger is not an
obstacle here — it is the invariant that makes this design verifiable. Auto-fork re-points each
affected subscriber's `card_states` onto *their own* copy; once that is done, no foreign
progress references the original, and the delete proceeds through the existing guard untouched.
**If the fork logic is ever wrong, the delete fails loudly instead of silently destroying
progress.** Do not weaken or bypass that trigger.

`0011_courses.sql` adds:

1. `delete_course(p_course_id uuid)` — `security definer`, `set search_path = ''`, matching the
   house style of `0005`. Verifies `auth.uid()` owns the course; for each *distinct* subscriber
   holding `card_states` on any card under the course, performs the same deep copy
   `fork_course` performs (course → notes → decks → cards, private rows skipped, `source_*_id`
   set, slugs regenerated in that user's namespace), re-points **that user's** `card_states` at
   their copy with `seen_version` = copied `content_version`, then deletes their subscription.
   Finally deletes the course row.
2. A DELETE policy on `courses` (`owner_id = auth.uid()`) and `grant delete on courses to authenticated`.

**Implementation constraints, each of which is a real trap:**

- **`fork_course` cannot be called directly.** It reads `auth.uid()` as the forker
  (`0005:172`). Here the *owner* is the caller and the beneficiary is someone else. The copy
  logic must be extracted into a helper taking an explicit `p_user_id`, with `fork_course`
  refactored to call it with `auth.uid()`. Do not duplicate 100 lines of deep-copy — that is
  how `fork_course` and its `published_at` bug (`0008` fix 3) drifted in the first place.
- **`card_states` re-points must pin `cs.user_id`.** `0008` added that comment to `fork_course`
  for a reason: these functions are `security definer` and bypass RLS, so an unpinned `UPDATE`
  re-points *every* user's progress into one person's copy. Here the loop runs per-beneficiary,
  which makes the pin easy to forget and catastrophic to omit.
- **`courses.deleted_at` is now dead weight.** Hard delete supersedes it. Leave the column
  (dropping it is churn on a table three RLS policies filter on) and note in ADR-002 that it is
  unused, so phase 06 does not build a second, contradictory deletion path.
- **Order matters.** Fork every beneficiary *before* deleting anything. A partial fork followed
  by a failed delete must roll back cleanly — it does, inside one function, in one transaction.

### Why not soft delete

`deleted_at` is already filtered by every RLS containment clause and by `subscribe_to_course`
/ `fork_course`, so a soft-deleted course is invisible to everyone else — but it stays in the
owner's own list forever, and the subscriber's live reference points at something that still
exists but can never be read. Auto-fork plus a real delete leaves no dangling half-state.

---

## Routes and server actions

| Route / action | Purpose |
|---|---|
| `/app/courses` | Course list; empty state with `c` hint |
| `/app/courses/new` | Create course |
| `/app/courses/[id]` | Course detail — its notes and decks |
| `createCourse` / `saveCourse` / `deleteCourse` | Server actions in `app/app/courses/actions.ts` |
| `/app/decks/[id]/preview` | Read-only deck revision sheet (E2) |

Modified: `createCard`/`updateCard` (`app/app/decks/actions.ts`) and `saveInlineEdit`
(`app/(review)/review/[deckId]/actions.ts`) gain the server-side content trust boundary (D3).
`submitReview` returns a real remaining count (defect 1).

---

## Component inventory

**New:** `components/editor/math-editor-field.tsx` · `components/courses/{course-list,course-form,course-picker,delete-course-button}.tsx` · `app/app/decks/[id]/preview/page.tsx` · `lib/editor/tiptap-extensions.ts` · `lib/db/courses.ts`

**Modified:** `components/review/{review-session,flashcard-card,grading-row,inline-edit-overlay,changed-card-dialog}.tsx` · `components/decks/{card-editor,card-list-client,deck-form,deck-detail,deck-list-row,delete-deck-button}.tsx` · `components/note/note-doc-view.tsx` · `components/editor/note-editor.tsx` (extension builder only) · `components/layout/app-shell.tsx` · `lib/shortcuts/{use-shortcut,provider,types,shortcut-manager}.ts(x)` · `styles/globals.css`

### The shared editor

`lib/editor/tiptap-extensions.ts` (pure config, no JSX) + `components/editor/math-editor-field.tsx`
(the React half: `useEditor`, `EditorContent`, the `$`/`⌘M`/`⌘⇧M` machine, `<MathInput>`,
the `katex-client` side effect). Reuses `components/editor/math-input.tsx` and
`lib/editor/serialize.ts` unchanged.

There are currently **four** copies of the same `buildExtensions` config
(`note-editor.tsx:33-41`, `card-editor.tsx:30-54`, `inline-edit-overlay.tsx:19-36`). Extracting
it makes three security properties unit-testable for the first time — `trust: false` (the XSS
control EVOLUTION names Tiptap as the vector for) and `addInputRules() → []` (the `$$…$$`
bypass) are today asserted by three identical **code comments and nothing else**.

**G2 is not separate work — it is what `MathEditorField` delivers.** That is the argument for
building it rather than patching two files: the alternative is a fourth and fifth copy of the
`$` state machine.

> **The trap.** `note-editor.tsx:84-85` holds **module-level singletons** (`editorHandle`,
> `mathOpener`). This works only because exactly one `NoteEditor` ever mounts. `MathEditorField`
> mounts **twice simultaneously** in the card editor (front + back): two instances sharing one
> module global means clicking a formula in the front opens the panel over the back, or the
> second mount's cleanup nulls the first's handle. **Per-instance refs, closures built inside
> the component.** Highest-probability regression in the phase, and it presents as something
> easy to dismiss as cosmetic.

`note-editor.tsx` adopts the shared *extension builder only*. Moving its component internals —
autosave, offline buffering, unmount flush, outline derivation, the 390px `useSyncExternalStore`
gate — onto a new shared component would risk phase 02's most-tested surface for zero
user-facing gain. Residual duplication is deferred deliberately, not overlooked.

---

## Order of work

**Step 1 — land the mechanical checks, failing.** Before any fix, so the blast radius is
enumerated by a machine rather than by anyone's reading. The suite is red at the end of step 1;
that is the deliverable.

**Steps 2–4 run in parallel** (no file overlap): **2** shortcuts core + session state machine ·
**3** i18n · **4** CSS/typography/dead classes.

**5** shared editor → **6** G (KaTeX CSS + math invocation) → **7** D (card editor) →
**8** F (edit from study) → **9** E (preview; can slot any time after 4) → **10** H (courses).

D must precede F (the trust boundary is written once, not twice) and H (both touch
`deck-form.tsx` and `decks/actions.ts`).

**If the phase stalls,** split at step 4: **03b-i** (1–4: checks, shortcuts, i18n, CSS) alone
makes the app usable and the suite honest; **03b-ii** (5–10: editor, courses).

---

## Acceptance criteria

1. `pnpm lint:i18n` fails on a missing key, a namespace-relative miss, an unlabelled
   `useShortcut`, and a locale-parity gap — proven by fixtures in both directions.
2. No `MISSING_MESSAGE` in the browser console during a full review session, in `en` or `es`.
3. The shortcut overlay shows a translated label for every binding, in every scope. No blank rows.
4. `1`–`4` grade and advance; `Space` reveals then grades Good; `u` restores the previous card;
   `e` opens the inline editor; `Esc` opens the end-session confirm. Each fires against
   **current** state, proven by a unit test that dispatches a real `window` keydown.
5. Registering a shortcut calls `register` exactly once across N re-renders (no churn loop).
6. `Escape` reaches a binding that opts into `allowInEditable` from inside a contenteditable,
   and does not reach one that has not opted in.
7. A session with N due cards shows all N and completes once, not after the first grade.
8. `pnpm build` fails if any class in `app/**` or `components/**` compiles to no CSS.
9. Card content renders with the reading typography — serif body, heading hierarchy, list and
   code styling, display equations centred with vertical padding — identical to the editor.
10. The review card is capped at `--container-review`; long content steps the reading scale
    down one token rather than scrolling or clipping.
11. `pnpm lint:contrast` passes with the grading row's Hard state rendered.
12. In the card editor: ⌘Enter saves, ⌘⇧Enter saves and starts a new card with focus in the
    front field, `Esc` cancels from inside the editor. All three have visible buttons.
13. Two cards created in sequence appear in creation order and keep it across reloads.
14. `$` and ⌘M insert math in the card editor and in the study-view inline editor, with the
    same panel as the note editor. A saved formula renders as KaTeX on reload.
15. A card's `content_version` bumps when its JSON changes even if the client submits unchanged
    `front_text` — the server recomputes and does not trust the client's copy.
16. The card list has a "show answers" toggle; `/app/decks/[id]/preview` renders front and back
    for every card and is reachable by a subscriber with no edit controls.
17. A card can be edited from the study view by `e` and by a visible control; the edit persists,
    bumps `content_version` when text changed, preserves the card's confidence, and the
    resulting `review_logs` row has `edited_during_review = true`.
18. A card whose `content_version > seen_version` shows the changed-card dialog with
    keep / start-over, and start-over resets to new without writing a `review_logs` row.
19. Creating a deck or note requires choosing or creating a course; an existing deck with
    `course_id is null` still lists and still opens.
20. A user cannot create a deck under another user's course (RLS, not UI).
21. Deleting a course with a subscriber who has review progress: that user ends up owning a
    complete copy, their `card_states` point at the copy with their scheduling intact, their
    subscription is gone, and the original is gone. A subscriber with no progress simply loses
    the subscription. The owner's own progress goes with the course.
22. A user can delete a course that was auto-forked to them.
23. All new strings in `en` and `es`.

---

## Verification

In the order `.claude/CLAUDE.md` requires:

1. `pnpm db:reset && pnpm db:types`
2. `pnpm typecheck && pnpm lint && pnpm build` — zero warnings. `build` now also runs
   `assert-classes-compile`.
3. `pnpm lint:i18n && pnpm lint:tokens && pnpm lint:contrast`
4. `pnpm test` — the three `use-shortcut` tests; both checkers' own two-directional tests;
   `tiptap-extensions` security assertions; `CreateCourseInput` contract tests.
5. `pnpm test:rls` — a deck cannot be created under another user's course; a public deck under
   a private course is invisible to `anon`. **These policies have existed since phase 01 and no
   test has ever passed them a non-null `course_id`.**
6. `pnpm test:db` — `delete_course` fork correctness: progress carried, subscription dropped,
   `seen_version` set, **and a negative test that an unpinned `card_states` update would fail**
   (two subscribers, assert each gets only their own rows). Plus the D3 case: JSON differs,
   client-supplied text unchanged, `content_version` **must** bump.
7. `pnpm test:e2e` — **assert resulting DB state, not that a dialog opened.** The phase-02
   lesson was e2e asserting shallow triggers without document state. New specs:
   `e2e/review/{keyboard,inline-edit,session-flow}.spec.ts`,
   `e2e/decks/{card-editor,preview}.spec.ts`, `e2e/courses/{create,delete-auto-fork}.spec.ts`.
8. **G1 needs a computed-style read, not DOM presence** — assert a rendered `.katex` has a
   non-default `font-family` on the *preview* route (the surface with no transitive import).
   A presence assertion passes against the bug. Same trap as the un-emulated `reducedMotion` test.
9. Screenshots at 390/768/1440 × dark/light → `design-critic` against `refs/`. **C is the one
   item where screenshots are primary evidence and the linters are the backstop** — the inverse
   of everywhere else. Expect `e2e/editor/screenshots.spec.ts` baselines to shift from C1's
   coupling; **read the diff, do not accept it.**
10. `code-reviewer`; `security-auditor` (D3's trust boundary and `delete_course`'s
    `security definer` both qualify); `detect_changes()`; `ship-phase`; `evolve`.

---

## Files I may touch

- `specs/phase-03b-remediation.md`, `specs/shortcuts.md` (amendment), `specs/ADR-002-schema-decisions.md` (decision 11), `specs/EVOLUTION.md`
- `packages/contracts/src/{schemas,index,db}.ts` — **approved**, see *Contract changes*
- `supabase/migrations/0011_courses.sql` (new)
- `scripts/{lint-i18n.mjs,assert-classes-compile.mjs,lint-tokens.mjs}` + tests + `scripts/__fixtures__/**`
- `lib/shortcuts/**`, `lib/editor/tiptap-extensions.ts` (new), `lib/db/{courses,cards,decks,notes,review}.ts`
- `app/app/courses/**` (new), `app/app/decks/**`, `app/(review)/**`, `app/app/layout.tsx`, `app/app/notes/actions.ts`
- `components/{courses,decks,review,note,editor,layout}/**`, `components/shortcut-overlay.tsx`
- `styles/globals.css`, `messages/{en,es}.json`, `vitest.config.ts`, `package.json`
- `e2e/**`, `tests/**`

**Do not touch:** `packages/contracts/src/{srs,content}.ts` (frozen) · migrations `0001`–`0010`
· `lib/editor/serialize.ts` (import only) · `styles/tokens.css` (no new design values — every
fix in C uses a token that already exists).

---

## Risks and open questions

1. **The shared-editor module singletons** (`note-editor.tsx:84-85`). Latent today, active the
   moment front and back mount together. See *The shared editor*.
2. **A naive fix for B reintroduces the infinite loop.** Adding `onPress` to the deps array
   makes the stale-closure test pass and trips "Maximum update depth exceeded"
   (EVOLUTION 2026-08-07). Only the latest-ref pattern satisfies both constraints.
   **The register-called-once test is not optional** — without it the fix oscillates between
   two bugs, each of which makes the other's test pass.
3. **`assert-classes-compile` false positives will get it disabled** — "a silenced linter is
   worse than no linter because it looks like coverage." Keep the prefix filter conservative;
   the allowlist must be small and **itself validated against `globals.css`**, so a deleted rule
   fails rather than granting permanent amnesty. That is the `lint:contrast` hand-picked-pair
   mistake (EVOLUTION 2026-08-04) in a new costume.
4. **The i18n checker will silently stop working** if a component aliases `t`, destructures it,
   or passes it as a prop — it would resolve nothing and report clean. It must **count and
   report** unresolvable call sites, with a test asserting that count is zero for the real
   codebase. Fourth instance of the coverage-shrink shape.
5. **`P0001` is already overloaded.** `enforce_private_requires_pro` raises without an
   `errcode`, so Postgres assigns generic `P0001` — which `lib/db/decks.ts:352` and
   `cards.ts:250` already map to two *different* meanings. Mapping it a third time by code
   alone yields a confidently wrong message. 03b matches on message content in
   `lib/db/courses.ts` **plus a `tests/rls` case pinning that message**, so a future edit to the
   trigger fails the suite instead of silently degrading the error. A proper `errcode` taxonomy
   migration is a follow-up, and it should cover decks and notes too — which makes it its own
   item, not part of H.
6. **`delete_course` is destructive and `security definer`.** It bypasses RLS by design. The
   ownership check, the per-beneficiary `cs.user_id` pin, and the ordering (fork all, then
   delete) are the three things that must be right. `security-auditor` reviews it.
7. **`aspect-[4/3]` passed `lint:tokens` for a different reason than the dead classes did** —
   the arbitrary-value rule requires a unit or colour function inside the brackets, so unitless
   values like `grid-cols-[1fr_2fr]` remain unguarded. C8 does not close that hole; one extra
   rule and one fixture case do, and the file is already open.
8. **Auto-fork on a popular course writes N deep copies in one transaction.** Fine at current
   scale (no sharing UI exists yet, so N is 0 in production). Flagged for phase 04, which is
   what will make N non-zero.
