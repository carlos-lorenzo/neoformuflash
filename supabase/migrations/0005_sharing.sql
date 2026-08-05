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
      (owner_id, course_id, slug, title, content_json, content_text, language, visibility, source_note_id)
    values
      (v_user_id, v_new_course,
       public.slugify(v_note.title) || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8),
       v_note.title, v_note.content_json, v_note.content_text, v_note.language,
       v_note.visibility, v_note.id)
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

  -- 4. Forking is one-way at deck scope.
  delete from public.deck_subscriptions
  where user_id = v_user_id and deck_id = p_deck_id;

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
      seen_version     = excluded.seen_version,
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
