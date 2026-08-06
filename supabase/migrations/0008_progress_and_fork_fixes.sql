-- ============================================================================
-- Phase 01 fixes, written after a hostile review of 0003-0007. Three silent
-- failures, each caught by a test that exercises a path the originals never did.
--
--   1. Deleting a deck/card destroyed every other user's progress.
--      0007 grants DELETE on decks and cards to authenticated, and
--      card_states.card_id is `on delete cascade` (0004). A deck owner hitting
--      delete therefore wiped the card_states of every subscriber and forker
--      of that deck. The cards_deck / decks_delete_own policies authorise the
--      OWNER's content row; nothing checked that the cascading progress rows
--      belonged to someone else.
--      Fix: a pair of BEFORE DELETE triggers (deck-level primary, card-level
--      for direct deletes) block the delete outright when any card_states row
--      references a card from a user OTHER than the deck owner. The owner's
--      own progress is still allowed to cascade away (they chose to delete
--      their own content). An earlier attempt tried to preserve subscriber
--      rows via an `orphaned_at` tombstone, but ON DELETE CASCADE fires after
--      the BEFORE trigger returns, so the rows were still cascade-deleted;
--      and an AFTER-trigger re-insert hits the FK to the now-deleted card.
--      Blocking is the only legal way. `review_logs` still cascade — a card
--      that no longer exists has no training data worth keeping, and unlike
--      `card_states` they carry no live scheduling state.
--
--   2. apply_review silently dismissed every content-change flag.
--      The ON CONFLICT branch set seen_version = excluded.seen_version, where
--      excluded.seen_version is the card's CURRENT content_version — so the
--      very review that surfaces a "this changed, keep or reset?" prompt
--      auto-acknowledged it, permanently, no dismissal recorded (ADR-002 §8
--      says a flag you cannot dismiss is a flag people learn to ignore).
--      Fix: on conflict, keep the user's own seen_version. Only
--      acknowledge_card_change moves it. First reviews (the insert path) still
--      accept the current version, which is correct — they just read the card.
--
--   3. fork_course produced invisible drafts.
--      Notes were copied without published_at, so a public note forked from a
--      public course landed as a draft (published_at is null), readable by
--      nobody but the forker and with a mutable slug (the notes_slug_immutable
--      WHEN clause needs a non-null published_at). The suite never saw it
--      because fork output was verified only through service_role, which
--      bypasses RLS.
--      Fix: carry published_at across the fork, matching the source's
--      publish state and its slug-immutability.
--
--   Bonus (ADR-002 §10, deck scope): fork_deck now cancels a course-level
--   subscription on the source deck's parent course, mirroring the downward
--   case fork_course already handled. Without it, a caller subscribed to
--   course C that contains deck D stays subscribed to C after forking D, so
--   the queue shows D (empty) and D' (their history) side by side — the exact
--   "both at any granularity" state decision 10 forbids.
-- ============================================================================

-- ============ 1. prevents destroying other users' progress ============
-- A pair of BEFORE DELETE triggers (deck-level + card-level) block deletion
-- when any card_states row references a card from a user OTHER than the
-- deck's owner. The owner's own card_states are allowed to cascade away (they
-- chose to delete their own progress), but other users' rows are protected by
-- the delete being refused entirely.
--
-- The deck-level trigger is the primary guard: deleting a deck cascades to
-- its cards and then to card_states, and the deck row carries owner_id, so
-- the check can run before any card disappears. It must be deck-level, not
-- card-level alone: on a deck CASCADE the BEFORE DELETE trigger on each card
-- fires AFTER the deck row is gone, so a card-level owner lookup returns NULL
-- and the delete slips through. The card-level trigger covers direct card
-- deletes (deck still exists), and defensively no-ops if the deck is gone.
--
-- review_logs.card_id keeps ON DELETE CASCADE intentionally: a card that no
-- longer exists has no training data worth keeping (the FSRS optimizer trains
-- on surviving cards). card_states, which carry live scheduling state, are
-- what must survive -- and they do, because the delete never happens.

create function prevent_cross_user_deck_delete() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_count integer;
begin
  select count(*) into v_count
  from public.card_states cs
  join public.cards c on c.id = cs.card_id
  where c.deck_id = old.id
    and cs.user_id <> old.owner_id;

  if v_count > 0 then
    raise exception
      'cannot delete deck: % user(s) other than the deck owner have active review progress',
      v_count using errcode = 'P0001';
  end if;

  return old;
end $$;

create trigger decks_protect_subscriber_progress
  before delete on public.decks
  for each row execute function prevent_cross_user_deck_delete();

-- Direct card deletes are guarded by a card-level trigger too. It looks up the
-- deck owner via old.deck_id — which is safe ONLY because the deck-level
-- trigger above blocks the CASCADE path first, so when this fires the deck row
-- still exists. (A card-level trigger alone was the bug: on a deck CASCADE the
-- deck row is already gone when the card trigger runs, so the owner lookup
-- returned NULL and the delete slipped through.)
create function prevent_cross_user_card_delete() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_owner_id uuid;
  v_count    integer;
begin
  select d.owner_id into v_owner_id from public.decks d where d.id = old.deck_id;
  if v_owner_id is null then
    return old; -- deck already gone; the deck-level trigger has this covered
  end if;

  select count(*) into v_count
  from public.card_states cs
  where cs.card_id = old.id
    and cs.user_id <> v_owner_id;

  if v_count > 0 then
    raise exception
      'cannot delete card: % user(s) other than the deck owner have active review progress',
      v_count using errcode = 'P0001';
  end if;

  return old;
end $$;

create trigger cards_protect_subscriber_progress
  before delete on public.cards
  for each row execute function prevent_cross_user_card_delete();

-- ============ 2. apply_review keeps the user's seen_version ============
-- This function is recreated, not patched: its signature is unchanged (0007's
-- EXECUTE grants survive), and the edit is the ON CONFLICT branch. The insert
-- path (first review) still records the current content_version, which is
-- correct; the conflict path must not auto-dismiss ADR-002 §8's flag.
create or replace function apply_review(
  p_card_id              uuid,
  p_rating               public.review_rating,
  p_phase_before         public.card_phase,
  p_elapsed_days         real,
  p_scheduled_days       real,
  p_review_stability     real,
  p_review_difficulty    real,
  p_lapses               integer,
  p_stability            real,
  p_difficulty           real,
  p_phase                public.card_phase,
  p_due_at               timestamptz,
  p_learning_steps       integer,
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

  -- Same containment check as acknowledge_card_change in 0005: security
  -- definer bypasses RLS, so a review must not be recordable against a card
  -- the caller could never actually SELECT.
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
      -- NOT excluded.seen_version: a review must not auto-dismiss a pending
      -- content-change flag (ADR-002 §8). Only acknowledge_card_change moves
      -- seen_version. Orphaned states are never reviewed (their card is gone).
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

-- ============ 3. fork_course carries published_at ============
-- Recreated for the same reasons as apply_review (signature unchanged, grants
-- survive). The notes insert gains published_at.
create or replace function fork_course(p_course_id uuid) returns public.fork_result
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
  -- contain private notes the owner uses for personal annotations. Copying
  -- them to a forker would leak content the author explicitly hid.
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
       v_note.visibility, v_note.published_at, v_note.id)
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
  -- filter above), not to every deck under the course.
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

  -- 3. Re-point the caller's card_states at the new cards. The WHERE pins
  -- cs.user_id = v_user_id: the procedures are security definer and bypass
  -- RLS, so dropping the filter would re-point EVERY user's progress into the
  -- caller's private fork. seen_version is set to the copied card's version:
  -- the caller just took ownership. review_logs are never re-pointed.
  update public.card_states cs
  set card_id = cm.new_id,
      deck_id = cm.new_deck_id,
      seen_version = cm.content_version
  from fork_card_map cm
  where cs.user_id = v_user_id
    and cs.card_id = cm.old_id;

  get diagnostics v_states = row_count;

  -- 4. Forking is one-way (decision 10): drop the caller's course subscription
  -- and any deck subscriptions on decks belonging to the source course.
  delete from public.course_subscriptions
  where user_id = v_user_id and course_id = p_course_id;

  delete from public.deck_subscriptions ds
  using public.decks d
  where ds.user_id = v_user_id
    and ds.deck_id = d.id
    and d.course_id = p_course_id;

  -- 5. Counters are moved by the subscription/fork triggers; nothing here
  -- writes a counter directly.

  return row(v_new_course, null, v_states)::public.fork_result;
end $$;

-- ============ fork_deck: deck scope of decision 10 ============
-- Recreated (signature unchanged) to add the upward half: forking a deck that
-- belongs to a course the caller subscribes to cancels that course
-- subscription, so the caller is not simultaneously connected to C and cut
-- off from D (ADR-002 §10, "never both, at any granularity").
create or replace function fork_deck(p_deck_id uuid) returns public.fork_result
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
  -- standalone: it does not reference the source course or note.
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

  -- 3. Re-point the caller's card_states (user_id pinned for the same reason
  -- as fork_course). review_logs are never re-pointed.
  update public.card_states cs
  set card_id = cm.new_id,
      deck_id = cm.new_deck_id,
      seen_version = cm.content_version
  from fork_card_map cm
  where cs.user_id = v_user_id
    and cs.card_id = cm.old_id;

  get diagnostics v_states = row_count;

  -- 4. Forking is one-way at every granularity. The deck subscription is
  -- cancelled; and when the source deck belongs to a course the caller also
  -- subscribes to, that course subscription goes too — otherwise the queue
  -- still serves the empty source D through the course while the caller owns
  -- D' with all their history.
  delete from public.deck_subscriptions
  where user_id = v_user_id and deck_id = p_deck_id;

  if v_source.course_id is not null then
    delete from public.course_subscriptions
    where user_id = v_user_id and course_id = v_source.course_id;
  end if;

  return row(null, v_new_deck, v_states)::public.fork_result;
end $$;
