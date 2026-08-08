# Phase 03 — Review engine

## Context

Phase 02 shipped the structured note editor; the SRS half of the product (FSRS-6, `card_states`, `review_logs`, `apply_review`, `acknowledge_card_change`) has been frozen in `packages/contracts/` + `supabase/migrations/` since phase 01 but nothing in `app/`, `components/`, or `lib/` reads or writes it. Phase 03 makes reviews real: decks, cards, a focused phone-first review session, and a read-only NoteDoc renderer (which phase 04 reuses for public notes).

**Scope decisions locked in interrogation with Carlos:**
- **Full deck/card management**: deck list, create deck, deck detail with card list, create/edit/delete cards, and the review session. `e` inline-edit during review is included.
- **Undo (`u`)** ships with a new `undo_review` migration (contract change, approved).
- **Changed-card flag** (keep-progress-or-reset) ships.
- **Streak** is maintained (DB trigger) and shown on the deck list + session-complete screen.
- **Confidence**: a card's manual score uses the **4-point FSRS rating scale** (`review_rating` enum: Again/Hard/Good/Easy), author-set from the card editor, default **Good**, sortable in the card list. Lives on `cards` (shared with subscribers).

**Contract change is approved** for this phase: one migration (`0009`), `schemas.ts` additions, and regenerated `db.ts`. Everything else rides on `lib/` + server actions + new UI.

## Goal and why

A student can review a deck to completion on a phone — see a card, reveal the answer, grade it Again/Hard/Good/Easy — and the stored intervals are identical to what the `ts-fsrs` reference computes for the same rating sequence. Cards are created and managed by the student in decks they own, so the review loop is usable before phase 05's AI generation exists.

## Not in this phase

- Sharing: subscribe/fork UI, public rendering, SEO (phase 04), fork buttons. `p` (publish toggle) and `f` (fork) shortcuts are not wired.
- AI flashcard generation from notes (phase 05).
- Courses UI — decks may carry a `course_id` but the form leaves it null (no course picker exists).
- Profile-level settings (retention defaults, etc.) — `profiles.desired_retention` stays read-only; the deck form sets the per-deck override.
- Card reordering by drag, card search, deck import/export.
- Per-user confidence (`cards.confidence` is author-set, per the locked decision).
- The home dashboard (`/app`) keeps its notes-only content; phase 03 only adds nav entries.

## Contract changes

### Migration `supabase/migrations/0009_review_engine.sql` (new)

```sql
begin;

-- 1. Author-set confidence on the review_rating scale (NULL = unset; editor
--    defaults new cards to 'good'). Enum order again<hard<good<easy is the
--    card-list sort key.
alter table public.cards add column confidence public.review_rating;

-- Column-level UPDATE grant, matching the phase-01 shape for cards.
grant update (confidence) on public.cards to authenticated;

-- 2. Undo the most recent review. apply_review stores no pre-review snapshot,
--    so the caller supplies the exact pre-review SrsState it held (its own
--    progress row). Deletes the last review_logs row and restores card_states
--    in one statement pair. seen_version / deck_id are preserved.
create function public.undo_review(p_card_id uuid, p_prev jsonb)
  returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_log_id  bigint;
begin
  if v_user_id is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select id into v_log_id
    from public.review_logs
   where user_id = v_user_id and card_id = p_card_id
   order by reviewed_at desc, id desc
   limit 1;
  if not found then
    raise exception 'nothing to undo' using errcode = 'P0002';
  end if;

  delete from public.review_logs where id = v_log_id;

  update public.card_states
     set stability        = coalesce((p_prev #>> '{stability}')::double precision, 0),
         difficulty       = coalesce((p_prev #>> '{difficulty}')::double precision, 5.0),
         phase            = coalesce((p_prev #>> '{phase}')::public.card_phase, 'new'),
         learning_steps   = coalesce((p_prev #>> '{learningSteps}')::integer, 0),
         reps             = coalesce((p_prev #>> '{reps}')::integer, 0),
         lapses           = coalesce((p_prev #>> '{lapses}')::integer, 0),
         due_at           = coalesce((p_prev #>> '{dueAt}')::timestamptz, now()),
         last_reviewed_at = (p_prev #>> '{lastReviewedAt}')::timestamptz
   where user_id = v_user_id and card_id = p_card_id;

  if not found then
    insert into public.card_states
      (user_id, card_id, deck_id, stability, difficulty, phase, learning_steps,
       reps, seen_version, lapses, due_at, last_reviewed_at)
    select v_user_id, p_card_id, c.deck_id,
           coalesce((p_prev #>> '{stability}')::double precision, 0),
           coalesce((p_prev #>> '{difficulty}')::double precision, 5.0),
           coalesce((p_prev #>> '{phase}')::public.card_phase, 'new'),
           coalesce((p_prev #>> '{learningSteps}')::integer, 0),
           coalesce((p_prev #>> '{reps}')::integer, 0),
           1,
           coalesce((p_prev #>> '{lapses}')::integer, 0),
           coalesce((p_prev #>> '{dueAt}')::timestamptz, now()),
           (p_prev #>> '{lastReviewedAt}')::timestamptz
      from public.cards c
     where c.id = p_card_id;
  end if;
end $$;

grant execute on function public.undo_review(uuid, jsonb) to authenticated;

-- 3. Streaks maintained atomically with a review. No trigger existed in 0004;
--    the app was supposed to own it. A trigger on review_logs INSERT keeps it
--    atomic with apply_review. "Day" is NEW.reviewed_at::date (server/UTC).
create function public.bump_streak()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_day date := (new.reviewed_at)::date;
begin
  insert into public.streaks (user_id, current_streak, longest_streak, last_active_date)
  values (new.user_id, 1, 1, v_day)
  on conflict (user_id) do update set
    current_streak = case
      when public.streaks.last_active_date = v_day then public.streaks.current_streak
      when public.streaks.last_active_date = v_day - 1 then public.streaks.current_streak + 1
      else 1
    end,
    longest_streak = greatest(
      public.streaks.longest_streak,
      case
        when public.streaks.last_active_date = v_day then public.streaks.current_streak
        when public.streaks.last_active_date = v_day - 1 then public.streaks.current_streak + 1
        else 1
      end
    ),
    last_active_date = v_day;
  return new;
end $$;

create trigger review_logs_bump_streak
  after insert on public.review_logs
  for each row execute function public.bump_streak();

commit;
```

### `packages/contracts/` (approved contract change)

- `src/schemas.ts`: add `confidence` to `CardInput` — `confidence: z.enum(['again','hard','good','easy']).nullable()` (reuse the `review_rating` values). Add a new `UpdateCardInput` (deckId, id, frontJson?, backJson?, frontText?, backText?, position?, confidence?) — the card-update action's input. Export both from `index.ts` (keep `CardInput` export).
- `src/db.ts`: regenerate via `pnpm db:types` (picks up `cards.confidence` + `undo_review` + `bump_streak`).
- No change to `srs.ts`, `content.ts`, or the SRS functions.

## Routes and server actions

| Path | Method | Input | Output | Access |
|---|---|---|---|---|
| `/app/decks` | GET | — | deck list w/ due/new counts, streak | owner + subscriber |
| `/app/decks/new` | GET | — | create-deck form | owner |
| `/app/decks/[id]` | GET | — | deck detail: settings, card list, Study | owner or visible |
| `/app/decks/[id]/cards/new` | GET | — | card editor (front+back+confidence) | deck owner |
| `/app/decks/[id]/cards/[cardId]/edit` | GET | — | card editor | deck owner |
| `/review/[deckId]` | GET | — | chrome-free review session | owner or visible |
| `createDeck` action | POST | `CreateDeckInput` | `{ id }` | owner |
| `updateDeck` action | POST | `{ id, title?, visibility?, desiredRetention?, newCardsPerDay? }` | `{ savedAt }` | owner |
| `deleteDeck` action | POST | `{ id }` | `{}` | owner |
| `createCard` action | POST | `CardInput` (+confidence) | `{ id }` | deck owner |
| `updateCard` action | POST | `UpdateCardInput` | `{ savedAt, contentVersion }` | deck owner |
| `deleteCard` action | POST | `{ id }` | `{}` | deck owner |
| `startReview` action | POST | `{ deckId }` | `{ deck, cards[], settings, streak }` | owner or visible |
| `gradeCard` action | POST | `ReviewSubmission` | `{ next, log }` | card visible to user |
| `undoGrade` action | POST | `{ cardId, prevState }` | `{}` | owner of the state |
| `acknowledgeChange` action | POST | `{ cardId, reset }` | `{}` | owner of the state |
| `saveInlineEdit` action | POST | `{ cardId, frontJson, backJson, frontText, backText, confidence? }` | `{ contentVersion }` | deck owner |

**Access notes** — "owner or visible" = the same containment the `cards_select_visible` RLS policy enforces (deck owner, or non-private deck under a non-private/non-deleted course). A subscribed user can review but cannot edit/delete cards or the deck.

**`startReview` response shape** (`lib/db/review.ts` + `app/(review)/review/actions.ts`):

```
{
  deck: { id, title, desiredRetention /* resolved */ },
  cards: [{
    card: { id, frontJson, backJson, contentVersion },
    state: SrsState | null,          // null = new card, no state yet
    changed: boolean,                // contentVersion > card_states.seen_version
    previews: { again, hard, good, easy },  // next interval label per rating, computed via schedule()
  }],
  streak: { current, longest, lastActiveDate } | null,
}
```

- Queue = lazy union from phase-01 spec: due states (`due_at <= now()` ordered by due_at) ∪ new cards (no state, ordered by `position`), new capped at `new_cards_per_day − count(review_logs where phase='new' and reviewed_at >= UTC-day start)`. Implemented in `lib/db/review.ts` with a `supabase.from(...).rpc(...)`-free approach: two bounded REST queries merged in TS (see Risks). Cap a session at 100 cards.
- `gradeCard` is **authoritative**: reloads the current `card_states` row at grade time (never trusts the client's copy), calls `schedule(state, rating, settings, now)` from `@neoformuflash/contracts`, then the `apply_review` RPC. Previews returned at `startReview` are best-effort display only.
- `undoGrade` sends the pre-review `SrsState` the client held → `undo_review` RPC. Streak is *not* decremented (cosmetic, rare path).

### `schedule()` → `apply_review` mapping (exact)

`schedule()` returns `{ next: SrsState, log: ScheduleLog }` (from `@neoformuflash/contracts`). The grade action calls `apply_review` via `supabase.rpc('apply_review', {…})` with this mapping:

| RPC param | Source |
|---|---|
| `p_card_id` | `submission.cardId` |
| `p_rating` | `submission.rating` |
| `p_elapsed_ms` | `submission.elapsedMs` (pass `null` if unknown) |
| `p_edited_during_review` | `submission.editedDuringReview` |
| `p_phase_before` | `log.phaseBefore` |
| `p_elapsed_days` | `log.elapsedDays` |
| `p_scheduled_days` | `log.scheduledDays` |
| `p_review_stability` | `log.reviewStability` |
| `p_review_difficulty` | `log.reviewDifficulty` |
| `p_stability` | `next.stability` |
| `p_difficulty` | `next.difficulty` |
| `p_phase` | `next.phase` |
| `p_due_at` | `next.dueAt.toISOString()` |
| `p_learning_steps` | `next.learningSteps` |
| `p_lapses` | `next.lapses` |

The RPC is void; on success the action returns the new `next` + `log` to the client (which updates its in-memory queue). The 1:1 correspondence is intentional — `apply_review` does zero maths; it receives pre-computed values only (ADR-001).

**Interval preview formatter** — `lib/review/format-interval.ts` (new util): `formatInterval(days: number): string` producing labels like `<1 min`, `10 min`, `3 d`, `2 w` (Mono, tabular-nums per design-system §2). A new card graded Again → learning step <1m; a mature review-phase card graded Good → the interval in days rendered as `X d` or `X w`. The exact thresholds are UI detail; keep them compact enough for the grading row's mono column.

## Component inventory

| Component | File | Client/Server | States it must handle |
|---|---|---|---|
| `NoteDocView` (read-only renderer) | `components/note/note-doc-view.tsx` | server (KaTeX `renderToString`) | prose, heading, bullet/ordered list, code block, blockquote, inline + display math, empty |
| `FlashcardCard` | `components/review/flashcard-card.tsx` | client | front, revealed (200ms Y-rotation, `--ease-in-out`; instant under `prefers-reduced-motion`), overflow → scale font down one step (never scroll) |
| `GradingRow` | `components/review/grading-row.tsx` | client | idle, submitting (disabled), 4 options `--danger/--warning/--text-secondary/--success` with interval preview in mono beneath; ≥44px targets at 390px; 1/2/3/4 + Space bindings |
| `ReviewSession` | `components/review/review-session.tsx` | client | loading queue, front, revealed, grading in-flight, learning-card return (short pause then re-show until graduated), undo stack, changed-card dialog, inline-edit overlay, end-session confirm, session-complete summary with streak |
| `ChangedCardDialog` | `components/review/changed-card-dialog.tsx` | client | open (Keep my progress / Start over), pending |
| `DeckList` / `DeckListRow` | `components/decks/deck-list.tsx` | client (row focus: j/k, Enter, s study, c create) | empty (CTA "Create deck" with `c` hint), populated, dense, error |
| `DeckForm` | `components/decks/deck-form.tsx` | client | idle, pending, field errors (catalog keys), free-user private-deck gate (hide + surface) |
| `CardEditor` | `components/decks/card-editor.tsx` | client | two Tiptap instances (front, back) reusing the phase-02 extension config (`StarterKit` + `InlineMath`/`BlockMath` with input rules disabled + KaTeX `katex-client`), confidence `Select`, invalid LaTeX, saved/error. **New component — do NOT refactor `NoteEditor`** (it owns note autosave; not reusable as-is). The Tiptap extension config is duplicated locally from `note-editor.tsx` (same `KATEX_OPTIONS`, same `InlineMathNoRules`/`BlockMathNoRules` pattern); both files document the duplication with a cross-reference so they stay in sync. |
| `CardList` | `components/decks/card-list.tsx` | client | empty ("Add a card" CTA), populated, dense, sort by position / confidence asc+desc, confidence badge (Again/Hard/Good/Easy), row delete-confirm dialog |
| `DeckStats` (optional inline) | `components/decks/deck-stats.tsx` | server | counts, streak pip (`radius-full`, the design system's only use) |

**Nav** — `components/layout/app-shell.tsx`: add `{ href: '/app/decks', label: t('decks') }` to `navItems` (`nav.review`/`nav.decks` keys already exist in catalogs). No "Review" nav entry — it is reached via Study.

**Review screen shell** — new route group `app/(review)/review/[deckId]/` with `app/(review)/layout.tsx` mounting `ShortcutManager` (enabled = `profiles.keyboard_shortcuts_enabled`) around a full-viewport container. No AppShell, no sidebar, no header. The page asserts `getSessionUser()`.

**Shortcuts (review scope — already exists in `lib/shortcuts/types.ts`)**: `Space` reveal→Good, `1-4` grade, `e` inline edit (owned decks only; hint suppressed on subscribed decks), `u` undo, `Esc` end session (confirm if cards remain). All `useShortcut('review', ...)` in `ReviewSession`.

## Acceptance criteria

1. A signed-in student opens Decks from the sidebar and sees their decks (owned + subscribed), each with a due count and a Study action; a user with no decks sees the empty state with a "Create deck" CTA and the `c` shortcut hint.
2. Creating a deck (title, visibility, desired retention, new cards/day) adds it to the list; its detail page shows a card list with an "Add a card" empty state.
3. Adding a card (front, back, confidence defaulting to **Good**) stores it; the detail list shows a front preview and a confidence badge, and can be sorted by position or by confidence ascending/descending.
4. Editing a card's confidence from the editor updates it and the list sort reflects it.
5. Study on a deck with due cards opens the chrome-free review screen (no sidebar/nav). The front is shown; Space reveals the back; the grading row shows Again/Hard/Good/Easy each with its interval preview; any of the four grades the card and advances.
6. After grading, reading back `card_states` (via service role in the test) shows `stability`, `difficulty`, `due_at`, `phase` equal to `schedule(state, rating, settings, now)` computed from the same pre-review state — the ts-fsrs reference — within tolerance.
7. A new card graded Good enters learning and is re-shown in the session (after a short pause) until it graduates; a graduated card does not reappear; the session shows a completion state once nothing remains.
8. Keyboard: `1`/`2`/`3`/`4` grade, `Space` reveals then grades Good, `u` undoes the last grade, `e` opens inline edit (owned decks), `Esc` ends the session with a confirm if cards remain. Typing into a text field never triggers a shortcut.
9. `u` removes the last `review_logs` row and restores the pre-grade `card_states`; the card is reviewable again and the session reflects it.
10. A card whose `content_version > seen_version` is shown with a "This card changed" notice and Keep-my-progress / Start-over actions. Start-over resets the card to new (`seen_version` current, `phase='new'`, no `review_logs` row); Keep leaves scheduling untouched and dismisses the flag.
11. The `review_logs` row for each grade records `rating`, `elapsed_ms` (measured from reveal), and `edited_during_review` when the card was edited mid-session.
12. Inline editing during review persists the edit (bumps `content_version` when text changed), acknowledges it for the editing user, and marks that review `edited_during_review`.
13. The first review of a UTC day bumps the streak; a second same-day review does not; reviewing the next day extends it. The deck list and the session-complete screen show the current streak.
14. At 390px the grading row sits in the bottom ~25% of the viewport, targets are ≥44px, there is no horizontal scroll, and an overflowing card scales its font down one step rather than scrolling.
15. With `prefers-reduced-motion`, revealing the back swaps instantly (no rotation).
16. A free user cannot create a private deck (DB rejects; the form surfaces the error).
17. All new UI strings exist in `en` and `es` and every error is a catalog key (`pnpm lint:i18n` passes).

## Verification

**Commands** (in order): `pnpm db:reset` → `pnpm db:types` → `pnpm typecheck && pnpm lint && pnpm build` → `pnpm test:rls` (new `tests/rls` or `tests/db` cases for `undo_review`, the streak trigger, and the confidence grant) → `pnpm test` (new contracts unit tests for `UpdateCardInput`/`confidence`) → `pnpm test:e2e`.

**New e2e specs** (`e2e/decks/` + `e2e/review/`, seeded via a new `seedDeck`/`seedCard`/`seedCardState` fixture helper on the admin client, following `e2e/editor/helpers.ts`):
- `decks-empty-state`, `decks-create-list`, `deck-detail-cards` (add/edit/delete, confidence + sort)
- `review-session-flow` (front → reveal → grade → complete)
- `review-interval-reference` — seed a known `card_states` row (last_reviewed_at set 48h before the test clock, so `elapsed_days=2` is stable for both the test's `schedule()` call and the server's), due in the past; grade one rating; assert stored `due_at` ≈ `schedule(knownState, rating, settings, ~now)` within tolerance (sub-second, since elapsed_days is integer and the test seeds it far from any day boundary), plus exact matches on `stability` and `difficulty`. This proves the full app→FSRS→DB path and satisfies the "intervals identical to the ts-fsrs reference" roadmap criterion.
- `review-learning-return`, `review-undo`, `review-changed-card`, `review-inline-edit`
- `review-keyboard`, `review-streak`, `review-mobile` (390px: bottom grading row, no scroll, font downscale), `review-reduced-motion`
- `screenshots.spec.ts` additions: decks-list-empty, decks-list-populated, deck-detail, card-editor, review-front, review-revealed, session-complete × dark/light × 390/768/1440 (reusing the existing `capture()` pattern)

**Reviewers**: `test-runner` (commands above), `design-critic` (screenshots against `refs/` + `specs/design-system.md` §6/§7), `code-reviewer` (diff), `security-auditor` (the two new security-definer functions `undo_review`/`bump_streak`, the `cards.confidence` grant, and the `apply_review` call boundary).

## Files I may touch

- `specs/phase-03-review-engine.md` (new — this document, materialised on approval)
- `supabase/migrations/0009_review_engine.sql` (new)
- `packages/contracts/src/schemas.ts`, `packages/contracts/src/index.ts`, `packages/contracts/src/db.ts` (regenerated)
- `app/app/decks/**` (new), `app/(review)/review/**` (new), `app/(review)/layout.tsx` (new)
- `components/review/**` (new), `components/decks/**` (new), `components/note/note-doc-view.tsx` (new)
- `lib/db/decks.ts`, `lib/db/cards.ts`, `lib/db/review.ts` (new); `lib/supabase/middleware.ts` (add `'/review'` to `AUTHED_PREFIXES`)
- `components/layout/app-shell.tsx` (navItems += decks)
- `messages/en.json`, `messages/es.json` (new `decks`/`review` namespaces)
- `e2e/decks/**`, `e2e/review/**`, `e2e/fixtures/` (deck/card/state seeding helper), `e2e/screenshots.spec.ts`
- `tests/` (rls/db suites for the new function + grant), `scripts/seed-dev.mjs` (set confidence on seed cards, optional)

Do not touch: `components/editor/**` (reuse via import only), `components/ui/**`, `lib/editor/serialize.ts` (import `proseToUnion`/`extractText`, do not modify), `packages/contracts/src/srs.ts` or `content.ts`, `supabase/migrations/0001–0008`.

## Risks and open questions

- **Learning-step re-show** is a documented deviation: `apply_review` schedules the real step interval, but a *focused session* re-shows an un-graduated learning/relearning card after a short fixed pause rather than making the student wait 1–10 min. Between-session spacing still follows FSRS exactly. Flag this in the code comment; revisit when sessions get longer.
- **Streak "today"** is the UTC day (`NEW.reviewed_at::date`). A non-UTC student reviewing late at night sees the next day's boundary — accepted for MVP.
- **Queue query** is built in TS from two REST queries (due states + new cards) rather than a new RPC, to avoid an extra contract change. A 500-card deck returns ≤100 cards/session; the `not in` filter uses the state ids, which are bounded. The phase-01 `explain analyze` proof (AC17) covers the SQL shape at the DB level; the app path does not re-prove it.
- **Route group `(review)`** is the repo's first route group and the first path outside `/app`. The middleware prefix list and the review layout's own `getSessionUser` guard must both be right, or the session is reachable unauthenticated.
- **`e` on subscribed decks** is suppressed (editing others' cards is a fork concern, later phase). The changed-flag still surfaces for subscribed users.
- **Undo** does not decrement the streak (no trigger on DELETE) and cannot restore a state the client did not hold; undoing after a full reload of a *different* session is still correct because the client re-fetches state per card at session start.
- This phase is deliberately large (deck CRUD + cards + session + renderer + migration). If the implementation session stalls, the natural split is **review-core** (renderer, session, queue, streak, changed-flag, undo) vs **deck/card management** (forms, list, sort, confidence). Ship review-core first.

### Changed-card dialog end-state after "Start over"

`acknowledgeCardChange(cardId, reset=true)` sets `phase='new'`, `due=now()`, `seen_version=content_version`, and resets all FSRS fields. The card does NOT become null-state — it keeps its `card_states` row with `phase='new'` and `due_at <= now()`. So it re-enters the session through the **due branch** of the lazy-union queue (`card_states due_at <= now()`), not the new-cards arm (`not exists` on card_states, which would miss it since the row now exists). This is correct: the student already saw this card and reset it, so it should come back up. After the reset, the client updates the in-memory queue entry to the reset state and re-shows the card as a fresh first-time card.
