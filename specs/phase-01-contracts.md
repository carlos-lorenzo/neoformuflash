# Phase 01 — Frozen contracts

## Goal and why

Freeze the schema, the RLS boundary and the TypeScript contract so phases 02
(editor), 03 (review engine) and 04 (public profiles) can run **in parallel git
worktrees** with `packages/contracts/**` and `supabase/migrations/**` read-only.
That parallelism only works if the contract is frozen first.

Nothing here is user-visible. Everything downstream depends on it. It is the
phase most likely to be rushed and the most expensive to get wrong — a mistake
in `card_states` or `fork_course` is silent, surfaces months later, and costs
every user their review history.

## Not in this phase

- No UI, no routes, no components, no `lib/db/*`.
- No AI features — `user_api_keys` and `ai_jobs` exist so phase 05 needs no
  migration, but nothing ships that uses them.
- No per-user FSRS optimisation (V2). `fsrs_parameters` ships as a table only.
- No course deletion flow — `courses.deleted_at` ships as a column so it is not
  a later ALTER on a hot table; the behaviour lands in phase 06.
- Phase 00's text+CHECK pattern is **not** extended; the new enums are real
  Postgres enums.

## Contract changes

Five migrations, one concern each, in this order:

| File | Contents |
|---|---|
| `0003_content.sql` | enums `visibility`, `card_phase`, `review_rating`, `ai_provider`; tables `courses`, `notes`, `decks`, `cards`; indexes; triggers `bump_card_content_version`, `set_updated_at`, `enforce_private_requires_pro`, slug immutability on the three new tables |
| `0004_srs.sql` | `card_states`, `review_logs`, `fsrs_parameters`, `streaks` + indexes |
| `0005_sharing.sql` | `course_subscriptions`, `deck_subscriptions`, counter triggers, and the procedures `subscribe_to_course`, `subscribe_to_deck`, `fork_course`, `fork_deck`, `acknowledge_card_change`, `apply_review` |
| `0006_ai.sql` | `user_api_keys`, `ai_jobs` |
| `0007_rls_and_grants.sql` | every `enable row level security`, every policy, every column grant, every revoke — including the TRUNCATE revoke and function EXECUTE revokes |
| `0008_progress_and_fork_fixes.sql` | Deck/card BEFORE DELETE triggers that block deletes when other users have progress; `apply_review` keeps `seen_version`; `fork_course` carries `published_at`; `fork_deck` cancels a parent-course subscription |

Ordering constraints that must hold: enums before the tables using them; every
function before its `grant execute`; `0007` before `0008` — the fixes recreate
0005 functions (`create or replace` preserves 0007's EXECUTE grants), and
0008's delete-protection triggers are `security definer` over the 0004 table.

### 0003_content.sql

```sql
-- ============ enums ============
create type visibility as enum ('public', 'unlisted', 'private');
create type card_phase as enum ('new', 'learning', 'review', 'relearning');
create type review_rating as enum ('again', 'hard', 'good', 'easy');
create type ai_provider as enum ('openai', 'google', 'anthropic');

-- ============ content ============
create table courses (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null references profiles(id) on delete cascade,
  institution_id uuid references institutions(id) on delete set null,
  degree_id      uuid references degrees(id) on delete set null,
  slug           text not null,                       -- immutable after first publish (decision 6)
  name           text not null,                       -- freely editable
  code           text,
  language       char(2) not null default 'es',       -- language the CONTENT is written in (decision 7)
  visibility     visibility not null default 'public',
  -- fork lineage. null = original work. Set by fork_course only.
  source_course_id uuid references courses(id) on delete set null,
  -- trigger-maintained counters; the subscription rows remain the truth
  subscriber_count integer not null default 0 check (subscriber_count >= 0),
  fork_count       integer not null default 0 check (fork_count >= 0),
  -- phase 06 soft-delete. Present now so it is not a later ALTER on a hot table.
  deleted_at     timestamptz,
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
  -- deck-level sharing is symmetric to course-level (decision 9)
  subscriber_count integer not null default 0 check (subscriber_count >= 0),
  fork_count       integer not null default 0 check (fork_count >= 0),
  created_at timestamptz not null default now(),
  unique (owner_id, slug)
);
create index decks_course_idx on decks (course_id);
create index decks_source_idx on decks (source_deck_id) where source_deck_id is not null;

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
  -- bumped ONLY on semantic change (front_text/back_text), by trigger. See decision 8.
  content_version integer not null default 1 check (content_version >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index cards_deck_idx on cards (deck_id, position);
create index cards_source_idx on cards (source_card_id) where source_card_id is not null;

-- ============ triggers ============
-- Formatting-only edits must not flag subscribers. The plain-text projections are the
-- test for "did what the student has to recall actually change" (decision 8).
create function bump_card_content_version() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  if new.front_text is distinct from old.front_text
     or new.back_text is distinct from old.back_text then
    new.content_version := old.content_version + 1;
  else
    new.content_version := old.content_version;
  end if;
  return new;
end $$;

create trigger cards_content_version
  before update on cards
  for each row execute function bump_card_content_version();

-- updated_at is trigger-managed on notes and cards.
create function set_updated_at() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger notes_set_updated_at
  before update on notes
  for each row execute function set_updated_at();

create trigger cards_set_updated_at
  before update on cards
  for each row execute function set_updated_at();

-- Private visibility requires pro. Enforced in the database, not the app (decision 4).
create function enforce_private_requires_pro() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  if new.visibility = 'private'
     and not (select p.is_pro from public.profiles p where p.id = new.owner_id) then
    raise exception 'private visibility requires an active subscription';
  end if;
  return new;
end $$;

create trigger courses_private_requires_pro
  before insert or update on courses
  for each row execute function enforce_private_requires_pro();

create trigger notes_private_requires_pro
  before insert or update on notes
  for each row execute function enforce_private_requires_pro();

create trigger decks_private_requires_pro
  before insert or update on decks
  for each row execute function enforce_private_requires_pro();

-- Slugs never change (decision 6). Reuses the phase 00 function; never redefined.
create trigger courses_slug_immutable
  before update on courses
  for each row execute function reject_slug_change();

-- A note's slug is fixed at first publish, changeable while it is a draft.
-- The WHEN clause keeps the draft state editable; once published it is forever
-- immutable, even if the note is later unpublished.
create trigger notes_slug_immutable
  before update on notes
  for each row when (old.published_at is not null or new.published_at is not null)
  execute function reject_slug_change();

create trigger decks_slug_immutable
  before update on decks
  for each row execute function reject_slug_change();
```

### 0004_srs.sql

```sql
-- ============ spaced repetition: FSRS-6 (ADR-001) ============
-- Per-user, decoupled from card content. Scheduling maths lives in ts-fsrs,
-- NOT in the database.
create table card_states (
  user_id          uuid not null references profiles(id) on delete cascade,
  card_id          uuid not null references cards(id) on delete cascade,
  deck_id          uuid not null references decks(id) on delete cascade, -- denormalised: the queue is per-deck
  stability        real not null default 0.0 check (stability >= 0.0),
  difficulty       real not null default 5.0 check (difficulty between 1.0 and 10.0),
  phase            card_phase not null default 'new',
  -- ts-fsrs's own step counter within the Learning/Relearning short-term steps
  -- (1m/10m). Must round-trip through apply_review unchanged, or a card on its
  -- second learning step gets treated as step 1 again and never graduates.
  learning_steps   integer not null default 0 check (learning_steps >= 0),
  reps             integer not null default 0 check (reps >= 0),
  -- highest cards.content_version this user has accepted. See decision 8.
  seen_version     integer not null default 1 check (seen_version >= 1),
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
  -- 0.0 is a valid PRE-review value: ts-fsrs reports difficulty=0 for a card's
  -- first-ever review (not yet assessed). card_states.difficulty stays 1.0-10.0
  -- because it only ever holds a POST-review value.
  review_difficulty    real not null check (review_difficulty between 0.0 and 10.0),
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
```

### 0005_sharing.sql

```sql
-- ============ subscribe / fork ============
-- A subscription row is the source of truth; subscriber_count is a maintained
-- counter. Rejecting private/own targets happens in the procedures AND in the
-- RLS insert policies (0007), so a direct insert cannot route around it.
create table course_subscriptions (
  user_id    uuid not null references profiles(id) on delete cascade,
  course_id  uuid not null references courses(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, course_id)
);
create index course_subscriptions_course_idx on course_subscriptions (course_id);

create table deck_subscriptions (
  user_id    uuid not null references profiles(id) on delete cascade,
  deck_id    uuid not null references decks(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, deck_id)
);
create index deck_subscriptions_deck_idx on deck_subscriptions (deck_id);

-- ============ counter maintenance (decision 5) ============
-- The subscription rows are the truth; these keep the counters readable without
-- an aggregate. The fork procedures achieve their counter effects THROUGH these
-- triggers (the subscription deletes they perform, the sourced copies they
-- insert) — never by writing counters directly, which would double-count.
-- security definer: unsubscribe is a direct authenticated DELETE (no procedure
-- wraps it), so without this the trigger would run as the caller, who has no
-- UPDATE grant on courses.subscriber_count.
create function sync_course_subscriber_count() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.courses set subscriber_count = subscriber_count + 1
      where id = new.course_id;
  elsif tg_op = 'DELETE' then
    update public.courses set subscriber_count = subscriber_count - 1
      where id = old.course_id;
  end if;
  return null;
end $$;

create trigger course_subscriptions_counter
  after insert or delete on public.course_subscriptions
  for each row execute function sync_course_subscriber_count();

-- security definer: same reason as sync_course_subscriber_count above.
create function sync_deck_subscriber_count() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.decks set subscriber_count = subscriber_count + 1
      where id = new.deck_id;
  elsif tg_op = 'DELETE' then
    update public.decks set subscriber_count = subscriber_count - 1
      where id = old.deck_id;
  end if;
  return null;
end $$;

create trigger deck_subscriptions_counter
  after insert or delete on public.deck_subscriptions
  for each row execute function sync_deck_subscriber_count();

-- A sourced copy bumps the source's fork_count exactly once.
create function sync_course_fork_count() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  update public.courses set fork_count = fork_count + 1
    where id = new.source_course_id;
  return new;
end $$;

create trigger courses_fork_counter
  after insert on public.courses
  for each row when (new.source_course_id is not null)
  execute function sync_course_fork_count();

create function sync_deck_fork_count() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  update public.decks set fork_count = fork_count + 1
    where id = new.source_deck_id;
  return new;
end $$;

create trigger decks_fork_counter
  after insert on public.decks
  for each row when (new.source_deck_id is not null)
  execute function sync_deck_fork_count();

-- ============ procedures ============
-- Composite return so the UI can say what a fork preserved.
create type fork_result as (course_id uuid, deck_id uuid, states_carried integer);

create function subscribe_to_course(p_course_id uuid) returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_course  public.courses;
begin
  if v_user_id is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select * into v_course from public.courses where id = p_course_id;
  if not found then
    raise exception 'course not found' using errcode = 'P0002';
  end if;
  if v_course.visibility = 'private' then
    raise exception 'cannot subscribe to a private course' using errcode = 'P0001';
  end if;
  if v_course.deleted_at is not null then
    raise exception 'course is deleted' using errcode = 'P0001';
  end if;
  if v_course.owner_id = v_user_id then
    raise exception 'cannot subscribe to your own course' using errcode = 'P0001';
  end if;

  insert into public.course_subscriptions (user_id, course_id)
  values (v_user_id, p_course_id)
  on conflict (user_id, course_id) do nothing; -- subscribing twice is a no-op
end $$;

create function subscribe_to_deck(p_deck_id uuid) returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_deck    public.decks;
begin
  if v_user_id is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select * into v_deck from public.decks where id = p_deck_id;
  if not found then
    raise exception 'deck not found' using errcode = 'P0002';
  end if;
  if v_deck.visibility = 'private' then
    raise exception 'cannot subscribe to a private deck' using errcode = 'P0001';
  end if;
  if v_deck.owner_id = v_user_id then
    raise exception 'cannot subscribe to your own deck' using errcode = 'P0001';
  end if;

  insert into public.deck_subscriptions (user_id, deck_id)
  values (v_user_id, p_deck_id)
  on conflict (user_id, deck_id) do nothing;
end $$;

create function fork_course(p_course_id uuid) returns public.fork_result
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_user_id    uuid := auth.uid();
  v_source     public.courses;
  v_new_course uuid;
  v_note       public.notes;
  v_new_note   uuid;
  v_deck       public.decks;
  v_new_deck   uuid;
  v_card       public.cards;
  v_new_card   uuid;
  v_states     integer;
begin
  if v_user_id is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- 1. Verify the source is public or unlisted and not soft-deleted.
  select * into v_source from public.courses where id = p_course_id;
  if not found then
    raise exception 'course not found' using errcode = 'P0002';
  end if;
  if v_source.visibility = 'private' then
    raise exception 'cannot fork a private course' using errcode = 'P0001';
  end if;
  if v_source.deleted_at is not null then
    raise exception 'course is deleted' using errcode = 'P0001';
  end if;

  -- 2. Deep-copy courses -> notes -> decks -> cards under the caller. Every
  -- copy sets its source_*_id. Slugs are regenerated in the caller's namespace.
  insert into public.courses
    (owner_id, institution_id, degree_id, slug, name, code, language, visibility, source_course_id)
  values
    (v_user_id, v_source.institution_id, v_source.degree_id,
     public.slugify(v_source.name) || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8),
     v_source.name, v_source.code, v_source.language, v_source.visibility, v_source.id)
  returning id into v_new_course;

  create temp table fork_note_map (old_id uuid primary key, new_id uuid) on commit drop;
  -- Private notes are skipped: visibility is per-row, so a public course may
  -- contain private notes the owner uses for personal annotations. Copying them
  -- to a forker would leak content the author explicitly hid.
  for v_note in
    select * from public.notes n
    where n.course_id = p_course_id and n.visibility <> 'private'
  loop
    insert into public.notes
      (owner_id, course_id, slug, title, content_json, content_text, language,
       visibility, published_at, source_note_id)
    values
      (v_user_id, v_new_course,
       public.slugify(v_note.title) || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8),
       v_note.title, v_note.content_json, v_note.content_text, v_note.language,
       v_note.visibility, v_note.published_at, v_note.id) -- 0008: carry the publish state; a fork of a public course is public content
    returning id into v_new_note;
    insert into fork_note_map values (v_note.id, v_new_note);
  end loop;

  create temp table fork_deck_map (old_id uuid primary key, new_id uuid) on commit drop;
  -- Same discipline as notes: private decks are skipped.
  for v_deck in
    select * from public.decks d
    where d.course_id = p_course_id and d.visibility <> 'private'
  loop
    insert into public.decks
      (owner_id, course_id, note_id, slug, title, visibility,
       desired_retention, new_cards_per_day, source_deck_id)
    values
      (v_user_id, v_new_course,
       (select m.new_id from fork_note_map m where m.old_id = v_deck.note_id),
       public.slugify(v_deck.title) || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8),
       v_deck.title, v_deck.visibility, v_deck.desired_retention,
       v_deck.new_cards_per_day, v_deck.id)
    returning id into v_new_deck;
    insert into fork_deck_map values (v_deck.id, v_new_deck);
  end loop;

  create temp table fork_card_map (
    old_id uuid primary key, new_id uuid, new_deck_id uuid, content_version integer
  ) on commit drop;
  -- Cards are scoped to fork_deck_map (the decks that survived the visibility
  -- filter above), not to every deck under the course — otherwise a card under
  -- a skipped private deck would look up a NULL new deck id and violate the
  -- not-null constraint on cards.deck_id.
  for v_card in
    select * from public.cards c
    where c.deck_id in (select m.old_id from fork_deck_map m)
  loop
    insert into public.cards
      (deck_id, front_json, back_json, front_text, back_text, position, complexity, source_card_id, content_version)
    values
      ((select m.new_id from fork_deck_map m where m.old_id = v_card.deck_id),
       v_card.front_json, v_card.back_json, v_card.front_text, v_card.back_text,
       v_card.position, v_card.complexity, v_card.id, v_card.content_version)
    returning id into v_new_card;
    insert into fork_card_map
    values (v_card.id, v_new_card,
            (select m.new_id from fork_deck_map m where m.old_id = v_card.deck_id),
            v_card.content_version);
  end loop;

  -- 3. Re-point the caller's card_states at the new cards. deck_id is
  -- denormalised for the queue — re-pointing card_id without it leaves the row
  -- invisible to the new deck's queue, silently. seen_version is set to the
  -- copied card's version: the caller just took ownership, so nothing is
  -- pending from an upstream author. review_logs are never re-pointed.
  update public.card_states cs
  set card_id = cm.new_id,
      deck_id = cm.new_deck_id,
      seen_version = cm.content_version
  from fork_card_map cm
  where cs.user_id = v_user_id
    and cs.card_id = cm.old_id;

  get diagnostics v_states = row_count;

  -- 4. Forking is one-way (decision 10): drop the caller's course subscription
  -- and any deck subscriptions on decks belonging to the source course. The
  -- delete triggers move the subscriber counters.
  delete from public.course_subscriptions
  where user_id = v_user_id and course_id = p_course_id;

  delete from public.deck_subscriptions ds
  using public.decks d
  where ds.user_id = v_user_id
    and ds.deck_id = d.id
    and d.course_id = p_course_id;

  -- 5. Counters. fork_count bumped by the courses_fork_counter trigger on the
  -- insert in step 2 (and per-deck by decks_fork_counter); subscriber counts
  -- decremented by the subscription triggers in step 4. Nothing here writes a
  -- counter directly.

  return row(v_new_course, null, v_states)::public.fork_result;
end $$;

create function fork_deck(p_deck_id uuid) returns public.fork_result
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_user_id  uuid := auth.uid();
  v_source   public.decks;
  v_new_deck uuid;
  v_card     public.cards;
  v_new_card uuid;
  v_states   integer;
begin
  if v_user_id is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select * into v_source from public.decks where id = p_deck_id;
  if not found then
    raise exception 'deck not found' using errcode = 'P0002';
  end if;
  if v_source.visibility = 'private' then
    raise exception 'cannot fork a private deck' using errcode = 'P0001';
  end if;

  -- 2. Deep-copy the deck and its cards under the caller. The copy is
  -- standalone: it does not reference the source course or note, which belong
  -- to the source author's structure.
  insert into public.decks
    (owner_id, course_id, note_id, slug, title, visibility,
     desired_retention, new_cards_per_day, source_deck_id)
  values
    (v_user_id, null, null,
     public.slugify(v_source.title) || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8),
     v_source.title, v_source.visibility, v_source.desired_retention,
     v_source.new_cards_per_day, v_source.id)
  returning id into v_new_deck;

  create temp table fork_card_map (
    old_id uuid primary key, new_id uuid, new_deck_id uuid, content_version integer
  ) on commit drop;
  for v_card in
    select * from public.cards c where c.deck_id = p_deck_id
  loop
    insert into public.cards
      (deck_id, front_json, back_json, front_text, back_text, position, complexity, source_card_id, content_version)
    values
      (v_new_deck, v_card.front_json, v_card.back_json, v_card.front_text, v_card.back_text,
       v_card.position, v_card.complexity, v_card.id, v_card.content_version)
    returning id into v_new_card;
    insert into fork_card_map values (v_card.id, v_new_card, v_new_deck, v_card.content_version);
  end loop;

  -- 3. Re-point the caller's card_states, exactly as in fork_course.
  update public.card_states cs
  set card_id = cm.new_id,
      deck_id = cm.new_deck_id,
      seen_version = cm.content_version
  from fork_card_map cm
  where cs.user_id = v_user_id
    and cs.card_id = cm.old_id;

  get diagnostics v_states = row_count;

  -- 4. Forking is one-way at every granularity (decision 10). The deck
  -- subscription is cancelled; and (0008) when the source deck belongs to a
  -- course the caller subscribes to, that course subscription goes too —
  -- otherwise the queue still serves the empty source D through C alongside
  -- D' with the caller's full history.
  delete from public.deck_subscriptions
  where user_id = v_user_id and deck_id = p_deck_id;

  if v_source.course_id is not null then
    delete from public.course_subscriptions
    where user_id = v_user_id and course_id = v_source.course_id;
  end if;

  return row(null, v_new_deck, v_states)::public.fork_result;
end $$;

-- Sets seen_version to current. When reset, returns the FSRS state to new.
-- lapses is PRESERVED (the student really did forget those times). Writes no
-- review_logs row, ever — the optimizer must only see real reviews.
create function acknowledge_card_change(p_card_id uuid, p_reset boolean) returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_user_id  uuid := auth.uid();
  v_version  integer;
begin
  if v_user_id is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- security definer bypasses RLS entirely, so this must manually re-apply
  -- the same visibility containment cards_select_visible enforces — otherwise
  -- a user could acknowledge a change on a card inside another user's private
  -- deck (or a deck under a private/deleted course) despite never being able
  -- to SELECT that card themselves.
  select c.content_version into v_version
  from public.cards c
  join public.decks d on d.id = c.deck_id
  where c.id = p_card_id
    and (d.owner_id = v_user_id
         or (d.visibility <> 'private'
             and (d.course_id is null
                  or exists (select 1 from public.courses co
                             where co.id = d.course_id
                               and co.visibility <> 'private'
                               and co.deleted_at is null))));
  if not found then
    raise exception 'card not found' using errcode = 'P0002';
  end if;

  if p_reset then
    update public.card_states
    set seen_version   = v_version,
        stability      = 0,
        difficulty     = 5.0,
        phase          = 'new',
        learning_steps = 0,
        due_at         = now(),
        reps           = 0
    where user_id = v_user_id and card_id = p_card_id;
  else
    update public.card_states
    set seen_version = v_version
    where user_id = v_user_id and card_id = p_card_id;
  end if;
end $$;

-- Receives PRE-COMPUTED values from packages/contracts/src/srs.ts; does no
-- arithmetic. Upserts card_states and inserts review_logs in one statement
-- pair, so a failure leaves neither (AC16).
create function apply_review(
  p_card_id              uuid,
  p_rating               public.review_rating,
  p_phase_before         public.card_phase,   -- review_logs.phase: state BEFORE this review
  p_elapsed_days         real,
  p_scheduled_days       real,
  p_review_stability     real,
  p_review_difficulty    real,
  p_lapses               integer,             -- absolute new lapses value, computed by ts-fsrs caller
  p_stability            real,                -- next stability
  p_difficulty           real,                -- next difficulty
  p_phase                public.card_phase,   -- next phase
  p_due_at               timestamptz,         -- next due_at
  p_learning_steps       integer,             -- next ts-fsrs learning-step counter
  p_elapsed_ms           integer,
  p_edited_during_review boolean
) returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_deck_id uuid;
  v_version integer;
begin
  if v_user_id is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- Same containment check as acknowledge_card_change above: security definer
  -- bypasses RLS, so a review must not be recordable against a card the
  -- caller could never actually SELECT (private deck they don't own, or a
  -- deck under a private/deleted course).
  select c.deck_id, c.content_version into v_deck_id, v_version
  from public.cards c
  join public.decks d on d.id = c.deck_id
  where c.id = p_card_id
    and (d.owner_id = v_user_id
         or (d.visibility <> 'private'
             and (d.course_id is null
                  or exists (select 1 from public.courses co
                             where co.id = d.course_id
                               and co.visibility <> 'private'
                               and co.deleted_at is null))));
  if not found then
    raise exception 'card not found' using errcode = 'P0002';
  end if;

  insert into public.card_states
    (user_id, card_id, deck_id, stability, difficulty, phase, learning_steps,
     reps, seen_version, lapses, due_at, last_reviewed_at)
  values
    (v_user_id, p_card_id, v_deck_id, p_stability, p_difficulty, p_phase,
     p_learning_steps, 1, v_version, p_lapses, p_due_at, now())
  on conflict (user_id, card_id) do update
  set stability        = excluded.stability,
      difficulty       = excluded.difficulty,
      phase            = excluded.phase,
      learning_steps   = excluded.learning_steps,
      reps             = card_states.reps + 1,
      -- 0008: NOT excluded.seen_version. A review must not auto-dismiss a
      -- pending content-change flag (decision 8); only acknowledge_card_change
      -- moves seen_version.
      seen_version     = card_states.seen_version,
      lapses           = excluded.lapses,
      due_at           = excluded.due_at,
      last_reviewed_at = now();

  insert into public.review_logs
    (user_id, card_id, rating, phase, elapsed_days, scheduled_days,
     review_stability, review_difficulty, elapsed_ms, edited_during_review)
  values
    (v_user_id, p_card_id, p_rating, p_phase_before, p_elapsed_days,
     p_scheduled_days, p_review_stability, p_review_difficulty,
     p_elapsed_ms, p_edited_during_review);
end $$;
```

### 0006_ai.sql

```sql
-- ============ AI ============
-- BYOK key storage. ciphertext is AES-256-GCM, key from env, NEVER returned to
-- the client. The only thing the UI ever displays is last_four.
create table user_api_keys (
  user_id      uuid not null references profiles(id) on delete cascade,
  provider     ai_provider not null,
  ciphertext   bytea not null,
  iv           bytea not null,
  last_four    char(4) not null,
  created_at   timestamptz not null default now(),
  primary key (user_id, provider)
);

create table ai_jobs (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references profiles(id) on delete cascade,
  kind           text not null check (kind in ('pdf_to_notes','copilot','notes_to_cards')),
  status         text not null default 'pending' check (status in ('pending','running','done','error')),
  input_tokens   integer,
  output_tokens  integer,
  error          text,
  created_at     timestamptz not null default now()
);
```

### 0007_rls_and_grants.sql

RLS controls which rows; column-level grants control which columns. A column
not granted is not writable by `authenticated` — the default after 0002. A new
column on a user-writable table must appear in a migration grant before the app
can write it.

```sql
-- ============ RLS: enable on every new table ============
alter table courses            enable row level security;
alter table notes              enable row level security;
alter table decks              enable row level security;
alter table cards              enable row level security;
alter table card_states        enable row level security;
alter table review_logs        enable row level security;
alter table fsrs_parameters    enable row level security;
alter table streaks            enable row level security;
alter table course_subscriptions enable row level security;
alter table deck_subscriptions enable row level security;
alter table user_api_keys      enable row level security;
alter table ai_jobs            enable row level security;

-- ============ content: own rows + public read ============
-- Owner sees everything they own (including private and deleted). Everyone else
-- sees public or unlisted; unlisted is readable by anyone holding the id — that
-- is what "unlisted" means. Discovery is prevented by never listing them.
create policy courses_select_own on courses
  for select to authenticated
  using (owner_id = auth.uid());
create policy courses_select_public on courses
  for select to anon, authenticated
  using (visibility <> 'private' and deleted_at is null);
create policy courses_insert_own on courses
  for insert to authenticated
  with check (owner_id = auth.uid());
create policy courses_update_own on courses
  for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());
-- No delete policy on courses: no DELETE grant (soft-delete is phase 06).

create policy notes_select_own on notes
  for select to authenticated
  using (owner_id = auth.uid());
-- A note is publicly readable only when: it isn't private; if it's 'public'
-- it must actually have been published (visibility defaults to 'public' the
-- instant a note is created, so an unpublished draft would otherwise be
-- world-readable from the first autosave — 'unlisted' has no such gate, since
-- reading it by id is the whole point of that visibility); and — when it
-- belongs to a course — that course isn't private or soft-deleted. A private
-- or deleted parent course must not be defeated by a public/unlisted child.
create policy notes_select_public on notes
  for select to anon, authenticated
  using (visibility <> 'private'
         and (visibility <> 'public' or published_at is not null)
         and (course_id is null
              or exists (select 1 from courses c
                         where c.id = notes.course_id
                           and c.visibility <> 'private'
                           and c.deleted_at is null)));
create policy notes_insert_own on notes
  for insert to authenticated
  with check (owner_id = auth.uid()
              and (course_id is null
                   or exists (select 1 from courses c
                              where c.id = course_id and c.owner_id = auth.uid())));
create policy notes_update_own on notes
  for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid()
              and (course_id is null
                   or exists (select 1 from courses c
                              where c.id = course_id and c.owner_id = auth.uid())));
create policy notes_delete_own on notes
  for delete to authenticated
  using (owner_id = auth.uid());

create policy decks_select_own on decks
  for select to authenticated
  using (owner_id = auth.uid());
-- Same containment discipline as notes: a private/deleted parent course must
-- not be defeated by a deck under it that's individually still 'public'.
create policy decks_select_public on decks
  for select to anon, authenticated
  using (visibility <> 'private'
         and (course_id is null
              or exists (select 1 from courses c
                         where c.id = decks.course_id
                           and c.visibility <> 'private'
                           and c.deleted_at is null)));
create policy decks_insert_own on decks
  for insert to authenticated
  with check (owner_id = auth.uid()
              and (course_id is null
                   or exists (select 1 from courses c
                              where c.id = course_id and c.owner_id = auth.uid()))
              and (note_id is null
                   or exists (select 1 from notes n
                              where n.id = note_id and n.owner_id = auth.uid())));
create policy decks_update_own on decks
  for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid()
              and (course_id is null
                   or exists (select 1 from courses c
                              where c.id = course_id and c.owner_id = auth.uid()))
              and (note_id is null
                   or exists (select 1 from notes n
                              where n.id = note_id and n.owner_id = auth.uid())));
create policy decks_delete_own on decks
  for delete to authenticated
  using (owner_id = auth.uid());

-- cards inherit deck visibility via an exists subquery — never by duplicating
-- the visibility column on cards. The deck's own visibility check here mirrors
-- decks_select_public's course-containment logic (a card must not be readable
-- through a deck that decks_select_public itself would refuse to show).
create policy cards_select_visible on cards
  for select to anon, authenticated
  using (exists (select 1 from decks d
                 where d.id = cards.deck_id
                   and (d.owner_id = auth.uid()
                        or (d.visibility <> 'private'
                            and (d.course_id is null
                                 or exists (select 1 from courses c
                                            where c.id = d.course_id
                                              and c.visibility <> 'private'
                                              and c.deleted_at is null))))));
create policy cards_insert_own on cards
  for insert to authenticated
  with check (exists (select 1 from decks d
                      where d.id = cards.deck_id and d.owner_id = auth.uid()));
create policy cards_update_own on cards
  for update to authenticated
  using (exists (select 1 from decks d
                 where d.id = cards.deck_id and d.owner_id = auth.uid()))
  with check (exists (select 1 from decks d
                      where d.id = cards.deck_id and d.owner_id = auth.uid()));
create policy cards_delete_own on cards
  for delete to authenticated
  using (exists (select 1 from decks d
                 where d.id = cards.deck_id and d.owner_id = auth.uid()));

-- ============ progress: strictly self-only, no public policy of any kind ============
create policy card_states_select_own on card_states
  for select to authenticated using (user_id = auth.uid());
create policy card_states_insert_own on card_states
  for insert to authenticated with check (user_id = auth.uid());
create policy card_states_update_own on card_states
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy review_logs_select_own on review_logs
  for select to authenticated using (user_id = auth.uid());
create policy review_logs_insert_own on review_logs
  for insert to authenticated with check (user_id = auth.uid());

create policy fsrs_parameters_select_own on fsrs_parameters
  for select to authenticated using (user_id = auth.uid());
create policy fsrs_parameters_insert_own on fsrs_parameters
  for insert to authenticated with check (user_id = auth.uid());
create policy fsrs_parameters_update_own on fsrs_parameters
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy streaks_select_own on streaks
  for select to authenticated using (user_id = auth.uid());
create policy streaks_insert_own on streaks
  for insert to authenticated with check (user_id = auth.uid());
create policy streaks_update_own on streaks
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ============ subscriptions: self-only, target must be shareable ============
-- The insert WITH CHECK re-asserts what the security-definer procedures check,
-- so a direct insert cannot route around them (private or own target).
create policy course_subscriptions_select_own on course_subscriptions
  for select to authenticated using (user_id = auth.uid());
create policy course_subscriptions_insert_own on course_subscriptions
  for insert to authenticated
  with check (user_id = auth.uid()
              and exists (select 1 from courses c
                          where c.id = course_id
                            and c.visibility <> 'private'
                            and c.deleted_at is null
                            and c.owner_id <> user_id));
create policy course_subscriptions_delete_own on course_subscriptions
  for delete to authenticated using (user_id = auth.uid());

create policy deck_subscriptions_select_own on deck_subscriptions
  for select to authenticated using (user_id = auth.uid());
create policy deck_subscriptions_insert_own on deck_subscriptions
  for insert to authenticated
  with check (user_id = auth.uid()
              and exists (select 1 from decks d
                          where d.id = deck_id
                            and d.visibility <> 'private'
                            and d.owner_id <> user_id));
create policy deck_subscriptions_delete_own on deck_subscriptions
  for delete to authenticated using (user_id = auth.uid());

-- ============ AI: self-only ============
create policy user_api_keys_select_own on user_api_keys
  for select to authenticated using (user_id = auth.uid());
create policy user_api_keys_insert_own on user_api_keys
  for insert to authenticated with check (user_id = auth.uid());
create policy user_api_keys_delete_own on user_api_keys
  for delete to authenticated using (user_id = auth.uid());

create policy ai_jobs_select_own on ai_jobs
  for select to authenticated using (user_id = auth.uid());
create policy ai_jobs_insert_own on ai_jobs
  for insert to authenticated with check (user_id = auth.uid());

-- ============ column grants ============
-- Anon: SELECT on public content only.
grant select on courses, notes, decks, cards to anon, authenticated;

-- courses: owner creates and edits their own. Slug immutable (decision 6).
-- source_course_id set on fork only; counters trigger-maintained.
grant insert (owner_id, slug, name, code, language, visibility, institution_id, degree_id)
  on courses to authenticated;
grant update (name, code, language, visibility, institution_id, degree_id)
  on courses to authenticated;

-- notes: owner creates and edits their own. updated_at trigger-managed.
grant insert (owner_id, course_id, slug, title, content_json, content_text,
              language, visibility)
  on notes to authenticated;
grant update (course_id, title, content_json, content_text, language, visibility,
              published_at)
  on notes to authenticated;

-- decks: owner creates and edits their own.
grant insert (owner_id, course_id, note_id, slug, title, visibility,
              desired_retention, new_cards_per_day)
  on decks to authenticated;
grant update (title, visibility, desired_retention, new_cards_per_day, course_id)
  on decks to authenticated;

-- cards: owner creates and edits within their own deck. content_version
-- bumped by trigger only (decision 8).
grant insert (deck_id, front_json, back_json, front_text, back_text,
              position, complexity)
  on cards to authenticated;
grant update (front_json, back_json, front_text, back_text, position)
  on cards to authenticated;

-- None of these tables have an anon or public SELECT policy (0007's own
-- comment: "strictly self-only, no public policy of any kind"), so unlike
-- courses/notes/decks/cards above, SELECT is granted to authenticated only —
-- the row filter is RLS, but the table-level grant must exist first or
-- PostgREST never reaches the policy check.
grant select on card_states, review_logs, fsrs_parameters, streaks,
  course_subscriptions, deck_subscriptions, ai_jobs
  to authenticated;

-- user_api_keys: a row policy is not a column grant (decision established in
-- 0002_rls_column_grants.sql) — RLS already scopes rows to their owner, but a
-- table-level grant would still expose ciphertext/iv to any authenticated
-- caller who owns the row, i.e. the very secret the encryption exists to
-- protect. Never grant SELECT on those two columns; the app decrypts
-- server-side with service_role, never through the authenticated role.
grant select (user_id, provider, last_four, created_at) on user_api_keys to authenticated;

-- course_subscriptions: subscribe (insert) or unsubscribe (delete). No update.
grant insert (user_id, course_id) on course_subscriptions to authenticated;
grant insert (user_id, deck_id) on deck_subscriptions to authenticated;

-- card_states: all columns are user-owned progress data; deck_id is set on
-- first review (lazy union) and re-pointed only by fork.
grant insert (user_id, card_id, deck_id, stability, difficulty, phase,
              learning_steps, reps, seen_version, lapses, due_at, last_reviewed_at)
  on card_states to authenticated;
grant update (stability, difficulty, phase, learning_steps, reps, seen_version,
              lapses, due_at, last_reviewed_at)
  on card_states to authenticated;

-- review_logs: append-only record of reviews. Never updated or deleted.
grant insert (user_id, card_id, rating, phase, elapsed_days, scheduled_days,
              review_stability, review_difficulty, elapsed_ms,
              edited_during_review)
  on review_logs to authenticated;

-- user_api_keys: user creates and deletes. Rotate = delete + create, not update.
grant insert (user_id, provider, ciphertext, iv, last_four)
  on user_api_keys to authenticated;

-- ai_jobs: user creates a job; status updates are service_role only.
grant insert (user_id, kind) on ai_jobs to authenticated;

-- fsrs_parameters: user's own optimizer weights.
grant insert (user_id, weights) on fsrs_parameters to authenticated;
grant update (weights, updated_at) on fsrs_parameters to authenticated;

-- streaks: maintained by the app on review/visit.
grant insert (user_id, current_streak, longest_streak, last_active_date)
  on streaks to authenticated;
grant update (current_streak, longest_streak, last_active_date)
  on streaks to authenticated;

-- ============ DELETE allowlist ============
-- Table-level DELETE for authenticated appears ONLY on these six tables.
grant delete on course_subscriptions, deck_subscriptions, user_api_keys,
  notes, decks, cards to authenticated;

-- ============ TRUNCATE ============
-- Supabase's default ACLs grant TRUNCATE to anon and authenticated on every new
-- table in public (pg_default_acl). RLS does not apply to TRUNCATE. Not
-- reachable through PostgREST today, but cheap defence-in-depth, and the grants
-- suite asserts zero TRUNCATE for either role on every table — including the
-- phase 00 tables created before this was found.
revoke truncate on institutions, degrees, profiles, institution_requests,
  courses, notes, decks, cards, card_states, review_logs, fsrs_parameters,
  streaks, course_subscriptions, deck_subscriptions, user_api_keys, ai_jobs
  from anon, authenticated;

-- ============ function EXECUTE ============
-- Postgres grants EXECUTE to PUBLIC by default; the security-definer procedures
-- run as the owner and bypass the caller's RLS, so anonymous EXECUTE is a
-- user-existence oracle and is never intentional. Trigger functions are checked
-- at trigger creation and are deliberately left alone (0002 F6).
revoke execute on function
  subscribe_to_course(uuid),
  subscribe_to_deck(uuid),
  fork_course(uuid),
  fork_deck(uuid),
  acknowledge_card_change(uuid, boolean),
  apply_review(uuid, review_rating, card_phase, real, real, real, real, integer,
               real, real, card_phase, timestamptz, integer, integer, boolean)
  from public;

grant execute on function
  subscribe_to_course(uuid),
  subscribe_to_deck(uuid),
  fork_course(uuid),
  fork_deck(uuid),
  acknowledge_card_change(uuid, boolean),
  apply_review(uuid, review_rating, card_phase, real, real, real, real, integer,
               real, real, card_phase, timestamptz, integer, integer, boolean)
  to authenticated, service_role;

-- service_role bypasses RLS but still needs the table grant, same discipline
-- as 0001 — every phase-01 table gets it explicitly, in one place.
grant all on courses, notes, decks, cards, card_states, review_logs,
  fsrs_parameters, streaks, course_subscriptions, deck_subscriptions,
  user_api_keys, ai_jobs to service_role;
```

**Grant discipline notes:**

- `source_*_id` is never in an INSERT grant. Fork is the only path that sets it,
  and the fork procedures are `security definer` (they run as the owner, who
  needs no grant). A direct insert naming `source_course_id` would forge lineage.
- `subscriber_count` / `fork_count` are never in INSERT or UPDATE grants. They
  are trigger-maintained; the triggers run as the owner.
- `slug` is never in an UPDATE grant (the immutability trigger already refuses,
  and the grant now agrees with it — the same shape as phase 00).
- `user_id` / `card_id` / `deck_id` on `card_states` are not in the UPDATE grant:
  the deck re-point is owned by the fork procedures.

### The queue query (lazy union)

New `card_states` rows are created on first review only, never in advance. The
queue is a union of "due states" and "cards with no state":

```sql
(select c.id, cs.due_at
   from card_states cs
   join cards c on c.id = cs.card_id
  where cs.user_id = $1 and cs.deck_id = $2 and cs.due_at <= now()
  order by cs.due_at
  limit $3)
union all
(select c.id, null
   from cards c
  where c.deck_id = $2
    and not exists (select 1 from card_states cs
                     where cs.user_id = $1 and cs.card_id = c.id)
  order by c.position
  limit $4)
```

The first branch filters on `(user_id, deck_id, due_at)` — exactly
`card_states_queue_idx`, proven by `explain analyze` (AC17). The daily
new-card allowance is `new_cards_per_day` minus the count of today's
`review_logs` rows with `phase = 'new'` — no extra table.

## Routes and server actions

None. This phase renders nothing and exposes no routes.

## Component inventory

None. No components, no states.

## TypeScript contract (`packages/contracts/`)

New files, all exported from `index.ts`. Zod error messages are stable dot-codes,
never prose — matching `schemas.ts`, because `lint:i18n` does not reach this
package.

| File | Exports |
|---|---|
| `src/srs.ts` | `SrsState`, `Rating`, `CardPhase`, `SchedulingSettings`, `FSRS6_DEFAULT_WEIGHTS`, `MAX_INTERVAL_DAYS = 365`, `LEARNING_STEPS`, and `schedule(state, rating, settings, now): { next, log }` wrapping `ts-fsrs` |
| `src/content.ts` | `NoteDoc` discriminated union — `doc`, `paragraph`, `heading` (1–3), `bulletList`, `orderedList`, `listItem`, `codeBlock`, `blockquote`, `text` with `bold`/`italic`/`code` marks, `inlineMath`, `displayMath` — plus `extractText(doc): string` |
| `src/sharing.ts` | `SubscribeInput`, `ForkInput`, `CourseLineage`, `ForkResult` (**includes `statesCarried: number`** so the UI can say what was preserved) |
| `src/schemas.ts` | *extend* with `CreateNoteInput`, `UpdateNoteInput`, `CreateDeckInput`, `CardInput`, `ReviewSubmission`, `ApiKeyInput` |
| `src/db.ts` | regenerated by `pnpm db:types` — never hand-edited |

`FSRS6_DEFAULT_WEIGHTS` is **read from `ts-fsrs` at module load, not
transcribed.** Twenty-one floats is exactly where a typo produces subtly wrong
scheduling that no test catches — ADR-001 item 4 is this mistake, already made
once in the source research. `extractText` renders math nodes as their LaTeX
source, per phase 02 AC8. `package.json`: `ts-fsrs` pinned **exact** (no caret).

## Tests

| File | Covers |
|---|---|
| `tests/rls/content.test.ts` | AC 4, 7, 12, 15 — visibility matrix across `courses`/`notes`/`decks`/`cards` for owner, other user and anon; private-requires-pro |
| `tests/rls/progress.test.ts` | AC 5, 6, 16 — `card_states`/`review_logs`/`user_api_keys`/`fsrs_parameters` are strictly self-only; two users on one public deck stay independent |
| `tests/db/sharing.test.ts` | AC 8, 9, 10, 11 — subscribe idempotence, counters, fork lineage, **the 90-day progress-survival assertion**, deck-level equivalents |
| `tests/db/card-version.test.ts` | AC 13, 14 — `content_version` bumps on semantic change only; dismiss/reset behaviour; edit-then-revert |
| `tests/db/queue.test.ts` | AC 17 — `explain analyze` proves the queue query uses `card_states_queue_idx` |
| `tests/db/cascade.test.ts` | AC 19 — an owner DELETE of a deck/card is refused when another user has `card_states` referencing that content; the deck/card stays, and the subscriber's state is untouched. The owner's own `card_states` are still allowed to cascade when they delete their own card. |
| `tests/db/grants.test.ts` | **extend** — the corrected invariant below |
| `packages/contracts/src/srs.test.ts` | AC 3 — golden fixtures |
| `packages/contracts/src/content.test.ts` | `extractText` over a document containing every node type |
| `tests/fixtures/seed.ts` | shared fixture builder used by the suites above |

**Corrected `grants.test.ts` invariant** — three assertions replacing the
current one, plus the `search_path` check:

1. Zero table-level INSERT/UPDATE for `authenticated` in `public`.
2. DELETE for `authenticated` appears **only** on the allowlist:
   `course_subscriptions`, `deck_subscriptions`, `user_api_keys`, `notes`,
   `decks`, `cards`. Any other table having it fails.
3. Zero TRUNCATE for `anon` or `authenticated` on any table in `public`.
4. Every `security definer` function in `public` has `proconfig` containing
   `search_path=`. Phase 00 applies this by discipline; nothing enforces it.

**FSRS golden fixtures** — `scripts/gen-fsrs-fixtures.mjs` calls `ts-fsrs`
directly and emits `packages/contracts/src/__fixtures__/fsrs-golden.json`,
committed. `srs.test.ts` compares `schedule()` against the committed file. A
library bump that changes intervals then fails loudly instead of silently
rescheduling every user. The generator is run deliberately, never as part of
`pnpm test`.

## Seed

- `supabase/seed.sql` stays taxonomy-only (it cannot create `auth.users`).
- `scripts/seed-dev.mjs` — service-role script, run after `db:reset`. Two users
  (one pro, one free), courses, notes spanning all three visibilities, decks,
  cards, a subscription, and **realistic volume**: a 500-card deck, a 5,000-word
  note, and 90 days of review history on a subscribed deck.

## Acceptance criteria

1. `supabase db reset` applies every migration cleanly from empty, and `pnpm db:types` then produces a `db.ts` that typechecks with zero errors.
2. `scripts/seed-dev.mjs` populates a local database a developer can browse: two users, both visibility extremes, a 500-card deck and 90 days of history.
3. A fixed rating sequence (Good, Good, Again, Good, Easy) through `schedule()` produces intervals identical to the committed `ts-fsrs` fixtures.
4. An anonymous visitor can read a **published** public note (`visibility = 'public'` and `published_at is not null`); cannot read a private one or an unpublished draft; can read an unlisted one by id. A public/unlisted note or deck under a private or soft-deleted course is not readable. A user cannot insert a note/deck under a course they do not own.
5. User A cannot read user B's `card_states`, `review_logs`, `user_api_keys` or `fsrs_parameters` under any query.
6. Two users reviewing the same public deck maintain independent progress. Neither can see the other's.
7. A free user cannot set `visibility = 'private'`; the attempt fails at the database.
8. Subscribing twice does not double-count. Unsubscribing restores the count.
9. A subscriber sees the author's later edits to a note without acting; a forker does not.
10. **A user with 90 days of review history on a subscribed deck forks it and loses nothing.** `stability`, `difficulty`, `due_at` and `lapses` survive row-for-row, matched through `source_card_id` — **and every carried row's `deck_id` points at the forked deck**, so the queue finds them.
11. Forking cancels the subscription (course-level and deck-level) and moves both counters.
12. Forking or subscribing to a private course fails at the database, not the app. **Forking a public/unlisted course skips private notes and decks** — `fork_course` copies only `visibility <> 'private'` sub-objects so private content is not leaked to the forker. Cards under skipped private decks are excluded (their `deck_id` does not appear in the copy set).
13. Editing a card's `front_text` flags subscribers; changing only formatting, reordering, or edit-then-revert does not.
14. A subscriber sees one flag per changed card. Dismissing does not re-flag next session. Resetting returns the card to new, preserves `lapses`, and writes no `review_logs` row. **A review of a changed card does not dismiss the flag** — `apply_review` keeps the user's `seen_version` (0008).
15. `update ... set slug = ...` raises on `profiles`, `courses` and published `notes`. `handle`, `display_name` and `title` update freely.
16. Submitting a review writes `card_states` and `review_logs` atomically — a failure leaves neither.
17. The queue query for "cards due for user U in deck D" uses `card_states_queue_idx`, proven by `explain analyze`.
18. No table in `public` grants TRUNCATE to `anon` or `authenticated`; DELETE appears only on the allowlist; no table-level INSERT/UPDATE exists for `authenticated`.
19. Deleting a deck or card (the owner's DELETE grant) does not destroy other users' `card_states`: the delete is blocked (0008) when a `card_states` row references a card from a user other than the deck owner; the owner's own states may cascade. Forking re-points only the forker's own states — another user's progress stays on the source card.

## Verification

```bash
pnpm typecheck && pnpm lint && pnpm build
pnpm db:reset && pnpm db:types
pnpm test          # unit: srs golden fixtures, content extractText, i18n
pnpm test:rls      # rls + db: content, progress, sharing, card-version, queue, grants
node scripts/seed-dev.mjs
```

No Playwright flows and no screenshots — this phase renders nothing. Reviewers:
**test-runner**, **code-reviewer**, **security-auditor** (RLS, key storage and
the anonymous-read boundary are all in scope). Not design-critic.

## Files I may touch

`packages/contracts/**`, `supabase/migrations/0003_*.sql` … `0008_*.sql`,
`supabase/seed.sql`, `scripts/seed-dev.mjs`, `scripts/gen-fsrs-fixtures.mjs`,
`tests/**`, `specs/phase-01-contracts.md`, `specs/ADR-002-schema-decisions.md`,
`specs/01-contracts.md` (delete), `specs/ROADMAP.md` (link only), root
`package.json` (scripts + `ts-fsrs`), `vitest.config.ts` (if a new include path
is needed).

**Not** `app/**`, **not** `components/**`, **not** `lib/**`. If this phase
appears to need any of those, stop and ask.

## Risks and open questions

- **Fork correctness is the whole phase.** AC10 is the one most likely to be
  quietly broken and least likely to be noticed. Write it before `fork_course`
  exists, watch it fail, then make it pass.
- **`card_states.deck_id` staleness** is the specific mechanism by which AC10
  breaks while looking fine — the rows are there, the queue just cannot see
  them. AC10 asserts `deck_id` explicitly for this reason.
- **`fork_course` is a large `security definer` function.** It bypasses the
  caller's RLS by design. Every id it touches is re-derived from the source
  rows, never taken from a parameter.
- **Owner deletes are a silent-progress-loss vector (0008).** `decks`/`cards`
  carry an owner DELETE grant; without the preserve-on-delete trigger,
  `card_states`/`review_logs` cascade would erase every subscriber's and
  forker's history on the author's first delete. `tests/db/cascade.test.ts` is
  the regression pin: the deck is really gone while the state survives.
- **Open:** the reserved-slug denylist in `profile_slug_base` guards profile
  slugs. Course and note slugs are namespaced per-owner (`unique (owner_id,
  slug)`), so squatting is not possible — but a course slugged `settings` under
  a public profile URL could still collide with a future route. Phase 04 owns
  public URL structure; flagged here rather than decided.
