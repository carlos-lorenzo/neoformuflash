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
