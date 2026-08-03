# Phase 01 — Frozen contracts

This phase produces no user-visible feature. It produces the document that lets phases 02, 03 and 04 be built **in parallel worktrees without collision**. It is the highest-leverage phase in the project and the one most likely to be rushed.

Nothing here ships to a user. Everything here is depended on by everything else.

---

## The seven decisions that shape the schema

Read these before the SQL. They are the non-obvious calls and the agents need the reasoning, not just the tables.

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

---

## Migration

```sql
-- ============ enums ============
create type visibility as enum ('public', 'unlisted', 'private');
create type ai_provider as enum ('openai', 'google', 'anthropic');
create type review_rating as enum ('again', 'hard', 'good', 'easy');

-- ============ taxonomy ============
create table institutions (
  id         uuid primary key default gen_random_uuid(),
  slug       text not null unique,
  name       text not null,
  country    char(2) not null,
  created_at timestamptz not null default now()
);

create table degrees (
  id             uuid primary key default gen_random_uuid(),
  institution_id uuid not null references institutions(id) on delete cascade,
  slug           text not null,
  name           text not null,
  unique (institution_id, slug)
);

-- ============ identity ============
create table profiles (
  id             uuid primary key references auth.users(id) on delete cascade,
  -- slug is the URL. Generated once from the Google account, IMMUTABLE forever (trigger below).
  slug           citext not null unique check (slug ~ '^[a-z0-9][a-z0-9_-]{2,29}$'),
  -- handle is the @name shown in the UI. Seeded from Google, user-editable.
  handle         citext not null unique check (handle ~ '^[a-z0-9][a-z0-9_-]{2,29}$'),
  display_name   text not null,
  avatar_url     text,
  locale         text not null default 'es' check (locale in ('es','en','ca')),
  institution_id uuid references institutions(id) on delete set null,
  degree_id      uuid references degrees(id) on delete set null,
  is_pro         boolean not null default false,
  desired_retention real not null default 0.90 check (desired_retention between 0.70 and 0.98),
  created_at     timestamptz not null default now()
);

-- ============ content ============
create table courses (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null references profiles(id) on delete cascade,
  institution_id uuid references institutions(id) on delete set null,
  degree_id      uuid references degrees(id) on delete set null,
  slug           text not null,                       -- immutable after first publish
  name           text not null,                       -- freely editable
  code           text,
  language       char(2) not null default 'es',       -- language the CONTENT is written in
  visibility     visibility not null default 'public',
  -- fork lineage. null = original work.
  source_course_id uuid references courses(id) on delete set null,
  -- trigger-maintained counters; course_subscriptions and source_course_id remain the truth
  subscriber_count integer not null default 0 check (subscriber_count >= 0),
  fork_count       integer not null default 0 check (fork_count >= 0),
  created_at     timestamptz not null default now(),
  unique (owner_id, slug)
);
create index courses_source_idx on courses (source_course_id) where source_course_id is not null;
create index courses_popular_idx on courses (subscriber_count desc) where visibility = 'public';

create table notes (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references profiles(id) on delete cascade,
  course_id    uuid references courses(id) on delete set null,
  slug         text not null,
  title        text not null,
  content_json jsonb not null default '{"type":"doc","content":[]}'::jsonb,
  content_text text not null default '',
  language     char(2) not null default 'es',
  visibility   visibility not null default 'public',
  source_note_id uuid references notes(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  published_at timestamptz,
  unique (owner_id, slug)
);
create index notes_owner_updated_idx on notes (owner_id, updated_at desc);
create index notes_public_idx on notes (published_at desc) where visibility = 'public';
create index notes_fts_idx on notes using gin (to_tsvector('simple', content_text));

create table decks (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references profiles(id) on delete cascade,
  course_id  uuid references courses(id) on delete set null,
  note_id    uuid references notes(id) on delete set null,
  slug       text not null,
  title      text not null,
  visibility visibility not null default 'public',
  -- scheduling settings live at deck level, never per card_state row
  desired_retention real check (desired_retention between 0.70 and 0.98), -- null = inherit from profile
  new_cards_per_day integer not null default 20 check (new_cards_per_day >= 0),
  source_deck_id uuid references decks(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (owner_id, slug)
);

create table cards (
  id         uuid primary key default gen_random_uuid(),
  deck_id    uuid not null references decks(id) on delete cascade,
  front_json jsonb not null,
  back_json  jsonb not null,
  front_text text not null default '',
  back_text  text not null default '',
  position   integer not null default 0,
  -- reading-load proxy, computed once on save. RECORDED for V2 analysis, not used for scheduling.
  complexity integer not null default 0,
  -- fork lineage. This is what lets a forker keep their review progress.
  source_card_id uuid references cards(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index cards_deck_idx on cards (deck_id, position);
create index cards_source_idx on cards (source_card_id) where source_card_id is not null;

-- ============ subscribe / fork ============
create table course_subscriptions (
  user_id    uuid not null references profiles(id) on delete cascade,
  course_id  uuid not null references courses(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, course_id)
);
create index course_subscriptions_course_idx on course_subscriptions (course_id);

-- You cannot subscribe to your own course. Enforced, not assumed.
create function reject_self_subscription() returns trigger as $$
begin
  if exists (select 1 from courses c where c.id = new.course_id and c.owner_id = new.user_id) then
    raise exception 'cannot subscribe to your own course';
  end if;
  return new;
end $$ language plpgsql;

-- Slugs never change. profiles.slug, courses.slug, notes.slug (once published).
create function reject_slug_change() returns trigger as $$
begin
  if new.slug is distinct from old.slug then
    raise exception 'slug is immutable';
  end if;
  return new;
end $$ language plpgsql;

-- ============ spaced repetition: FSRS-6 (see specs/ADR-001-spaced-repetition.md) ============
-- Per-user, decoupled from card content. Scheduling maths lives in ts-fsrs, NOT in the database.
create type card_phase as enum ('new', 'learning', 'review', 'relearning');

create table card_states (
  user_id          uuid not null references profiles(id) on delete cascade,
  card_id          uuid not null references cards(id) on delete cascade,
  deck_id          uuid not null references decks(id) on delete cascade, -- denormalised: the queue is per-deck
  stability        real not null default 0.0 check (stability >= 0.0),
  difficulty       real not null default 5.0 check (difficulty between 1.0 and 10.0),
  phase            card_phase not null default 'new',
  reps             integer not null default 0 check (reps >= 0),
  lapses           integer not null default 0 check (lapses >= 0),
  due_at           timestamptz not null default now(),
  last_reviewed_at timestamptz,
  primary key (user_id, card_id)
);
-- Serves the actual query: "what is due for me, in this deck, soonest first".
create index card_states_queue_idx on card_states (user_id, deck_id, due_at);
create index card_states_card_idx  on card_states (card_id);

-- Every column below exists so the official FSRS optimizer can be run later.
-- Dropping any of them makes the logs unusable for training. Do not trim this table.
create table review_logs (
  id                   bigserial primary key,
  user_id              uuid not null references profiles(id) on delete cascade,
  card_id              uuid not null references cards(id) on delete cascade,
  rating               review_rating not null,
  phase                card_phase not null,            -- state BEFORE this review
  elapsed_days         real not null check (elapsed_days >= 0.0),   -- true time since last review
  scheduled_days       real not null check (scheduled_days >= 0.0), -- interval it was scheduled for
  review_stability     real not null check (review_stability >= 0.0),
  review_difficulty    real not null check (review_difficulty between 1.0 and 10.0),
  elapsed_ms           integer check (elapsed_ms >= 0), -- RECORDED, never used for scheduling in MVP
  edited_during_review boolean not null default false,
  reviewed_at          timestamptz not null default now()
);
create index review_logs_user_time_idx on review_logs (user_id, reviewed_at desc);
create index review_logs_fit_idx       on review_logs (user_id, card_id, reviewed_at asc);

-- Per-user optimised weights. V2 — the table exists now so adding it needs no migration.
-- Global defaults live in packages/contracts/src/srs.ts, NOT as a null-user_id row here
-- (a primary key column cannot be null).
create table fsrs_parameters (
  user_id    uuid primary key references profiles(id) on delete cascade,
  weights    double precision[] not null check (array_length(weights, 1) = 21),
  updated_at timestamptz not null default now()
);

create table streaks (
  user_id          uuid primary key references profiles(id) on delete cascade,
  current_streak   integer not null default 0,
  longest_streak   integer not null default 0,
  last_active_date date
);

-- ============ AI ============
create table user_api_keys (
  user_id      uuid not null references profiles(id) on delete cascade,
  provider     ai_provider not null,
  ciphertext   bytea not null,   -- AES-256-GCM, key from env, NEVER returned to client
  iv           bytea not null,
  last_four    char(4) not null, -- the only thing the UI ever displays
  created_at   timestamptz not null default now(),
  primary key (user_id, provider)
);

create table ai_jobs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references profiles(id) on delete cascade,
  kind        text not null check (kind in ('pdf_to_notes','copilot','notes_to_cards')),
  status      text not null default 'pending' check (status in ('pending','running','done','error')),
  input_tokens  integer,
  output_tokens integer,
  error       text,
  created_at  timestamptz not null default now()
);
```

## The two procedures that need to be atomic

Everything else is a plain query. These two are not, and getting them half-applied leaves a user in a state they cannot fix themselves.

### `subscribe_to_course(p_course_id uuid)`
Insert into `course_subscriptions`, bump `courses.subscriber_count`. Rejects private and own-course targets. Idempotent — subscribing twice is a no-op, not an error.

### `fork_course(p_course_id uuid) returns uuid`
One transaction, in this order:

1. Verify the source is `public` or `unlisted`. Private courses cannot be forked.
2. Deep-copy `courses` → `notes` → `decks` → `cards` under the caller, setting every `source_*_id` to the row it came from and generating fresh slugs under the caller's namespace.
3. **Re-point the caller's existing `card_states` at the new card ids**, joining old → new on `source_card_id`. `review_logs` stay pointed at the original cards — history is a record of what actually happened and is never rewritten.
4. Delete the caller's `course_subscriptions` row for the source, if any. Forking is one-way.
5. Increment `courses.fork_count` on the source and decrement `subscriber_count` if step 4 removed a row.

Return the new course id. If any step fails, none of it happened.

**Deletion policy:** when an author deletes a course that has subscribers, do not cascade. Subscribers keep working copies. Set `courses.deleted_at` and stop it appearing in discovery. This is deferred to phase 06 but the column belongs in this migration so it is not a later ALTER on a hot table.

## RLS

Every table gets `alter table X enable row level security;`. The pattern, stated once so agents apply it consistently:

- **Own rows, full control.** `using (owner_id = auth.uid())` for select/insert/update/delete.
- **Public read.** A second select policy: `using (visibility in ('public','unlisted'))`. Note this deliberately makes unlisted readable by anyone with the id — that is what "unlisted" means. Discovery is prevented by never listing them, not by RLS.
- **`cards` inherit deck visibility** via `exists (select 1 from decks d where d.id = cards.deck_id and (d.owner_id = auth.uid() or d.visibility <> 'private'))`.
- **`card_states`, `review_logs`, `streaks`, `user_api_keys`, `ai_jobs`, `fsrs_parameters`: strictly `user_id = auth.uid()`.** No public policy of any kind, ever.
- **Private visibility requires pro.** Enforce with a trigger, not app code:
  ```sql
  create function enforce_private_requires_pro() returns trigger as $$
  begin
    if new.visibility = 'private'
       and not (select is_pro from profiles where id = new.owner_id) then
      raise exception 'private visibility requires an active subscription';
    end if;
    return new;
  end $$ language plpgsql;
  ```
  Applied as a before-insert-or-update trigger on `notes` and `decks`.

- **`course_subscriptions`: `user_id = auth.uid()` for write.** Read is also self-only — subscriber lists are not public, only the count is.
- **Subscribing or forking requires the target be `public` or `unlisted`.** Enforced inside the procedures, which are `security definer`, and re-checked in the RLS select policy so a direct query cannot route around it.
- **Slug immutability** is a before-update trigger, not a policy. Policies control who may write; triggers control what a write may contain.

The service-role key is used in exactly two places: the Stripe webhook handler and database migrations. If it appears anywhere else, that is a blocking security finding.

## TypeScript contract

`packages/contracts/` exports, and nothing else in the repo defines these:

- `src/db.ts` — generated by `supabase gen types typescript`. Never hand-edited.
- `src/schemas.ts` — Zod schemas for every input crossing a trust boundary: `CreateNoteInput`, `UpdateNoteInput`, `CreateDeckInput`, `CardInput`, `ReviewSubmission`, `SignupProfileInput`, `ApiKeyInput`.
- `src/srs.ts` — `SrsState`, `Rating`, `CardPhase`, `SchedulingSettings`, the FSRS-6 default weight vector, and the pure function signature `schedule(state: SrsState, rating: Rating, settings: SchedulingSettings, now: Date): { next: SrsState; log: ReviewLogInput }`. **The body wraps `ts-fsrs`; we do not implement the algorithm.** See `specs/ADR-001-spaced-repetition.md`. The signature is frozen here so the review UI can be built against it in parallel with phase 02.
  The default weight vector must be **imported or copy-verified from the upstream reference implementation**, never hand-transcribed. Twenty-one floats is exactly the kind of thing that is wrong in a way no test catches.
- `src/i18n.ts` — `Locale = 'es' | 'en' | 'ca'`, `ContentLanguage`, `DEFAULT_LOCALE`, and `resolveLocale(profileLocale, acceptLanguage)`. Message catalogs live in `messages/<locale>.json` outside this package; only the types are frozen here.
- `src/sharing.ts` — `SubscribeInput`, `ForkInput`, `CourseLineage`. The fork result type must include the count of `card_states` rows carried across, so the UI can say what was preserved rather than leaving the student to wonder.
- `src/content.ts` — the Tiptap node schema as a discriminated union, plus `extractText(doc: NoteDoc): string`. Both the editor (phase 02) and the AI layer (phase 05) depend on this.

## Acceptance criteria

1. `supabase db reset` applies every migration cleanly from empty.
2. `supabase gen types typescript` produces a file that typechecks with zero errors.
3. A seed script creates two users, one pro and one free, with public, unlisted and private notes.
4. An RLS test suite proves, for each table: the free user cannot set `visibility='private'`; user A cannot read user B's private note by direct id; user A cannot read user B's `card_states`, `review_logs` or `user_api_keys` under any query; an anonymous client can read a public note and cannot read an unlisted one it does not have the id for.
5. Two users reviewing the same public deck maintain independent `card_states`. **Test this explicitly** — it is the decision most likely to be silently broken later.
6. `schedule()` reproduces the `ts-fsrs` reference fixtures exactly. A golden-file test: a fixed rating sequence (Good, Good, Again, Good, Easy) against default weights produces byte-identical intervals to the library's own test vectors. This is the only defence against silently wrong scheduling.
7. Changing a user's `desired_retention` touches exactly one row. If it touches N rows, the setting is on the wrong table.
8. The queue query for "cards due for user U in deck D" uses `card_states_queue_idx` — verified with `explain analyze`, not assumed.
9. A subscriber sees the author's later edits to a note without any action on their part; a forker does not.
10. **A user with 90 days of review history on a subscribed deck forks it and keeps every scheduling state.** Assert row-for-row that `stability`, `difficulty`, `due_at` and `lapses` survive, matched through `source_card_id`. This is the acceptance criterion most likely to be quietly broken and least likely to be noticed.
11. Forking a course deletes the subscription and moves both counters. Subscribing twice does not double-count.
12. Attempting to fork or subscribe to a private course fails at the database, not the app.
13. `update profiles set slug = ...` raises. Same for `courses` and published `notes`. `handle`, `display_name` and `title` all update freely.
14. A profile created from a Google account with a display name containing spaces, accents or non-Latin characters still produces a valid, unique slug. Test with `José Martínez-Peña` and a collision against an existing slug.
15. An anonymous request with `Accept-Language: es-ES,es;q=0.9` gets the Spanish interface; a signed-in user's `profiles.locale` overrides the header; a public note written in Spanish serves `<html lang="es">` regardless of who is reading it.

## Verification

```
pnpm --filter contracts typecheck
supabase db reset && pnpm test:rls
```

## Files I may touch

`packages/contracts/**`, `supabase/migrations/**`, `supabase/seed.sql`, `tests/rls/**`.

## Resolved decisions

**Fork semantics** — copy, not reference, with `source_*_id` lineage preserved and progress carried across. See decision 5.

**Username** — Google-derived, editable; slug immutable. See decision 6.

**New-card materialisation — lazy union, decided here.** `card_states` rows are created on first review only, never in advance. The queue is:

```sql
(select ... from card_states
   where user_id = $1 and deck_id = $2 and due_at <= now()
   order by due_at limit $3)
union all
(select ... from cards c
   where c.deck_id = $2
     and not exists (select 1 from card_states cs
                      where cs.user_id = $1 and cs.card_id = c.id)
   order by c.position limit $4)
```

The daily new-card allowance is `new_cards_per_day` minus the count of today's `review_logs` rows with `phase = 'new'` — no extra table.

I previously leaned toward materialising rows on deck open. **The subscription model changes that answer.** Materialising means every subscriber to a 500-card course gets 500 rows written on subscribe, and every card the author adds afterwards requires a fan-out write across all subscribers. That is a background job and a reconciliation bug waiting to happen, in exchange for avoiding one anti-join that Postgres executes on a primary key. Lazy wins, and it wins harder the more successful a shared course becomes.

## Remaining open question

- **What happens to a subscriber's `card_states` when the author edits a card's content?** Options: leave the schedule untouched (simplest, but a rewritten card is arguably a new memory), reset the card to `new`, or flag it and let the student decide. Leaving it untouched is the MVP answer and needs no schema. Flagging would need an `updated_at` comparison against `card_states.last_reviewed_at`, which the columns already support — so this is a phase 03 UX decision, not a schema one. Noted so it is not discovered mid-build.
