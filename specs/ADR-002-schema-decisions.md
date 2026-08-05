# ADR-002 — Schema decisions that shape phase 01

**Status:** accepted · supersedes the draft in `specs/01-contracts.md` (deleted)
**Source:** planning session for phase 01, 2026-08-04

## Decision

Freeze the application schema, the RLS boundary and the TypeScript contract so
phases 02, 03 and 04 can run in parallel worktrees with `packages/contracts/**`
and `supabase/migrations/**` read-only. The first eight decisions below are
moved verbatim from `specs/01-contracts.md`; decisions 9 and 10 were written
during planning.

Read these before the SQL. They are the non-obvious calls and the agents need
the reasoning, not just the tables.

### 1. Card content and card *progress* are separate tables

`cards` holds the question and answer. `card_states` holds one row per **(user, card)** with that user's FSRS memory state.

Without this split, a public deck can only ever have one person's review history, and community sharing — the core acquisition loop — is architecturally impossible. Retrofitting the split after launch means migrating every user's progress. This is the single most expensive mistake available in this project, and it costs nothing to avoid now.

### 2. Institution and degree are tables, not free-text columns

Captured at signup, no UI in MVP. As normalised rows with slugs, the V2 "browse by university" feature is a query, not a migration and a data-cleanup project. A `text` column here would mean 400 spellings of "Universitat Politècnica de València" by the time it matters.

### 3. Note content is stored twice, deliberately

`content_json` (Tiptap's document) is the source of truth for editing. `content_text` (plain text, LaTeX stripped to readable form) exists for full-text search, SEO meta descriptions, and as the input to the notes→flashcards AI call. Denormalised on purpose; regenerated on every save inside the same transaction.

### 4. Visibility is a three-value enum, not a boolean

`public | unlisted | private`. `unlisted` (link works, not indexed, not on the profile) is what people actually want when sharing a half-finished note with one classmate, and adding it later would mean touching every RLS policy. `private` is gated on `profiles.is_pro`, enforced in the database, not in the app.

### 5. Subscribe and fork are opposites, and forking is one-way

Two ways to use someone else's course:

- **Subscribe** — you do not own the content. The original author's edits flow to you. You own your progress (`card_states`), which is why decision 1 exists. This is the default and the one that makes the community loop work.
- **Fork** — a deep copy under your ownership. You can edit everything. You are cut off from upstream changes, permanently. **Forking cancels the subscription**: you cannot be both subscribed to and a fork of the same course.

Every copied row keeps a `source_*_id` pointer to the row it came from. That does three things at once: it makes fork attribution possible, it lets the forker's existing progress carry across the copy (a join, not a data loss), and it leaves the door open for a V2 "upstream has changed, review the diff" feature without a migration.

**Progress survives a fork.** A student who has reviewed a subscribed deck for three months and then forks it to fix one typo must not lose three months of scheduling. The fork procedure re-points their `card_states` at the new card ids via `source_card_id`. Getting this wrong is silent and unforgivable — it is an explicit acceptance criterion.

`subscriber_count` and `fork_count` live on `courses` as trigger-maintained counters. The underlying rows remain the source of truth; the counters exist so "browse by popularity" in V2 is an index scan rather than an aggregate over every subscription in the system.

### 6. Slugs are immutable; titles and handles are not

The Google account supplies the initial handle at signup. The user can change it later. **The URL slug, derived once at signup, never changes.**

Same rule for notes and courses: the slug is fixed at first publish, the title is free to change forever. Public pages are the SEO and acquisition surface, and a URL that changes when someone tidies a title is a link that breaks in a WhatsApp group six months later. Two columns is a trivial cost; a redirect table and a lost backlink graph is not.

### 7. Interface language and content language are different things

`profiles.locale` is which language the *product* speaks to you in. `notes.language` / `courses.language` is what language the *content* is written in. They are unrelated: a student with an English interface writes notes in Spanish constantly.

This distinction decides the URL scheme. Public content pages are **not** locale-prefixed — a Spanish note lives at one URL, declares `<html lang="es">` from `notes.language`, and is indexed once. Prefixing every public URL by interface locale would generate duplicate URLs for content that was never translated, which is an SEO liability, not a feature. Authenticated `/app/*` routes are `noindex` and take their locale from the profile with no URL involvement at all.

Content language also feeds the AI layer: flashcards generated from a Spanish note must come back in Spanish. Storing it now means phase 05 reads a column instead of guessing from the text.

### 8. Edited cards are flagged by content version, not by timestamp

**Correction to the previous draft.** I said flagging needed no schema because `cards.updated_at > card_states.last_reviewed_at` already expresses "changed since you last saw it". That was wrong on two counts, and both would have surfaced mid-build in phase 03.

First, **there is nowhere to record a dismissal.** A student who says "keep my progress" gets asked again next session, and every session after that, because `last_reviewed_at` does not move when they decline. A flag you cannot dismiss is a flag people learn to ignore.

Second, **`updated_at` fires on edits that are not changes.** Reordering a card, re-saving with different whitespace, a formatting-only tweak in the Tiptap JSON, or a bulk migration touching the table — all bump `updated_at`, none alter what the student has to recall. Timestamps also break on edit-then-revert, where the content is identical and the timestamp is not.

So:

- `cards.content_version` — an integer, bumped by trigger **only when `front_text` or `back_text` actually changes.** Those columns are the rendered plain-text projections, so a formatting-only edit leaves them identical and the version does not move. This is a second use for a denormalisation we were already paying for.
- `card_states.seen_version` — the version this user last accepted. The flag is `cards.content_version > card_states.seen_version`, which is a plain integer comparison on rows already loaded for the queue.

Dismissing sets `seen_version` to current and nothing else. Resetting sets `seen_version` to current *and* returns the FSRS state to new.

**A reset writes no `review_logs` row.** The optimizer must only ever see real reviews with real ratings; a synthetic interval reset with no grade would corrupt parameter fitting. This is the same reasoning as `edited_during_review`, applied one level up.

Forking sets `seen_version` on the carried states to the new cards' version — you have just taken ownership, so there is nothing pending from an upstream author you are no longer connected to.

### 9. Deck-level sharing is symmetric to course-level

A standalone deck (`decks.course_id is null`) is shareable in its own right. Requiring a course wrapper to share one deck is friction on the most common sharing act. So `decks` carries the same `subscriber_count` / `fork_count` counters and `deck_subscriptions` exists, mirroring `course_subscriptions` — a student shares a deck by itself as often as they share a whole course, and forcing a course around it would make the simplest sharing act the most awkward one.

### 10. Forking is one-way at every level

`fork_course` drops the caller's `course_subscriptions` row *and* any `deck_subscriptions` rows on decks belonging to that course. Otherwise a user ends up both subscribed to deck D and owning its copy D′, and the queue shows both. The same rule applies at deck scope: `fork_deck` drops the caller's `deck_subscriptions` row for the source deck. A user is either connected to upstream (subscribed) or cut off (owner of a fork) — never both, at any granularity.

---

## Deferred and out of scope

- **Per-user FSRS weight optimisation** is V2. `fsrs_parameters` exists now so adding it later needs no migration, but the optimisation job is a phase-07+ concern.
- **Course deletion policy** (`courses.deleted_at`, non-cascading) is deferred to phase 06; the column ships in phase 01 so it is not a later ALTER on a hot table.
- **Reserved-slug denylist for course/note slugs** is namespaced per-owner (`unique (owner_id, slug)`), so squatting is not possible — but a course slugged `settings` under a public profile URL could still collide with a future route. Phase 04 owns public URL structure; flagged, not decided.
