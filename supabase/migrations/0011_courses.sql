-- ============ course deletion with auto-fork (ADR-002 decision 11) ============
--
-- Phase 01 shipped `courses` with no DELETE policy and no DELETE grant, and
-- deferred the question. Phase 03b makes the course hierarchy required, which
-- promotes deletion from cosmetic to blocking: a user who creates a wrong
-- course is otherwise stuck with it forever, on the primary nav entry.
--
-- A course is hard-deleted, and every subscriber holding review progress is
-- forked first (ADR-002 decision 11). Subscribers hold a live reference that
-- tracks the author's edits; deleting the upstream forces the live-vs-detached
-- question, and silently destroying their scheduling state is not an option.
-- So the delete converts each affected subscriber into a forker — the state
-- they would have chosen had they known the course was going away — and leaves
-- the copy theirs to delete in turn.
--
-- The deep-copy body of `fork_course` (0005) is extracted into
-- `copy_course_for_user`, which takes an explicit user id, and `fork_course`
-- calls it with auth.uid(). Duplicating the copy logic is how fork_course
-- acquired its published_at bug (0008) in the first place — and here the
-- OWNER is the caller while the beneficiary is someone else, so fork_course
-- itself cannot be reused.

-- ---------------------------------------------------------------------------
-- 1. The shared deep-copy helper
-- ---------------------------------------------------------------------------
-- Copies course -> notes -> decks -> cards under p_user_id, setting source_*_id
-- and regenerating slugs in that user's namespace. Private notes/decks are
-- skipped (visibility is per-row; copying them would leak content the author
-- explicitly hid). Re-points p_user_id's card_states at the copies with
-- seen_version = copied content_version, so a fresh fork has nothing pending
-- from an upstream author. review_logs are never re-pointed.
--
-- No visibility check on the source course here: fork_course enforces it (you
-- cannot fork a private course), but delete_course must be able to auto-fork a
-- course the owner made private AFTER people subscribed — they studied it, so
-- their progress is preserved exactly as if the course were still public.
create function copy_course_for_user(p_course_id uuid, p_user_id uuid)
  returns public.fork_result
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
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
  select * into v_source from public.courses where id = p_course_id;
  if not found then
    raise exception 'course not found' using errcode = 'P0002';
  end if;

  insert into public.courses
    (owner_id, institution_id, degree_id, slug, name, code, language, visibility, source_course_id)
  values
    (p_user_id, v_source.institution_id, v_source.degree_id,
     public.slugify(v_source.name) || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8),
     v_source.name, v_source.code, v_source.language, v_source.visibility, v_source.id)
  returning id into v_new_course;

  -- delete_course calls this in a loop (once per beneficiary), so the temp
  -- tables must survive repeated calls inside one transaction: drop-then-create
  -- gives each call a clean map regardless of how many came before.
  drop table if exists fork_note_map;
  create temp table fork_note_map (old_id uuid primary key, new_id uuid) on commit drop;
  for v_note in
    select * from public.notes n
    where n.course_id = p_course_id and n.visibility <> 'private'
  loop
    insert into public.notes
      (owner_id, course_id, slug, title, content_json, content_text, language, visibility, published_at, source_note_id)
    values
      (p_user_id, v_new_course,
       public.slugify(v_note.title) || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8),
       v_note.title, v_note.content_json, v_note.content_text, v_note.language,
       v_note.visibility, v_note.published_at, v_note.id)
    returning id into v_new_note;
    insert into fork_note_map values (v_note.id, v_new_note);
  end loop;

  drop table if exists fork_deck_map;
  create temp table fork_deck_map (old_id uuid primary key, new_id uuid) on commit drop;
  for v_deck in
    select * from public.decks d
    where d.course_id = p_course_id and d.visibility <> 'private'
  loop
    insert into public.decks
      (owner_id, course_id, note_id, slug, title, visibility,
       desired_retention, new_cards_per_day, source_deck_id)
    values
      (p_user_id, v_new_course,
       (select m.new_id from fork_note_map m where m.old_id = v_deck.note_id),
       public.slugify(v_deck.title) || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8),
       v_deck.title, v_deck.visibility, v_deck.desired_retention,
       v_deck.new_cards_per_day, v_deck.id)
    returning id into v_new_deck;
    insert into fork_deck_map values (v_deck.id, v_new_deck);
  end loop;

  drop table if exists fork_card_map;
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

  -- Re-point p_user_id's card_states at the new cards. deck_id is
  -- denormalised for the queue — re-pointing card_id without it leaves the row
  -- invisible to the new deck's queue, silently. seen_version is set to the
  -- copied card's version: the user just took ownership, so nothing is pending
  -- from an upstream author.
  update public.card_states cs
  set card_id = cm.new_id,
      deck_id = cm.new_deck_id,
      seen_version = cm.content_version
  from fork_card_map cm
  where cs.user_id = p_user_id
    and cs.card_id = cm.old_id;

  get diagnostics v_states = row_count;

  return row(v_new_course, null, v_states)::public.fork_result;
end $$;

-- ---------------------------------------------------------------------------
-- 2. fork_course refactored onto the helper
-- ---------------------------------------------------------------------------
-- Behaviour is unchanged: the auth check, the public/unlisted-not-private
-- check and the one-way subscription teardown stay in fork_course; only the
-- deep-copy body moves out.
create or replace function fork_course(p_course_id uuid) returns public.fork_result
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_source  public.courses;
  v_result  public.fork_result;
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

  -- 2. Deep copy under the caller.
  v_result := public.copy_course_for_user(p_course_id, v_user_id);

  -- 3. Forking is one-way (decision 10): drop the caller's course subscription
  -- and any deck subscriptions on decks belonging to the source course. The
  -- delete triggers move the subscriber counters.
  delete from public.course_subscriptions
  where user_id = v_user_id and course_id = p_course_id;

  delete from public.deck_subscriptions ds
  using public.decks d
  where ds.user_id = v_user_id
    and ds.deck_id = d.id
    and d.course_id = p_course_id;

  return v_result;
end $$;

-- ---------------------------------------------------------------------------
-- 3. delete_course — hard delete with auto-fork
-- ---------------------------------------------------------------------------
-- The owner's course. Every distinct user (other than the owner) holding
-- card_states on any card under the course is auto-forked first: their states
-- re-point to their own copy, their subscriptions are dropped. Only then are
-- the course's decks deleted (cards cascade) and the course row itself.
--
-- The deck-level trigger decks_protect_subscriber_progress (0008) is the proof,
-- not an obstacle: it blocks deleting any deck where a user other than the
-- owner holds card_states. After the auto-fork loop no foreign progress
-- references the course's decks, so each deck delete passes the guard
-- untouched. If the fork logic is ever wrong, the delete FAILS LOUDLY instead
-- of silently destroying progress. Do not weaken that trigger to make this
-- "simpler".
--
-- Order matters: fork every beneficiary before deleting anything. A partial
-- fork followed by a failed delete must roll back cleanly — it does, inside
-- one function, in one transaction.
create function delete_course(p_course_id uuid) returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_owner_id    uuid;
  v_beneficiary uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select owner_id into v_owner_id from public.courses where id = p_course_id;
  if not found then
    raise exception 'course not found' using errcode = 'P0002';
  end if;
  if v_owner_id <> auth.uid() then
    raise exception 'cannot delete a course you do not own' using errcode = '42501';
  end if;

  -- Auto-fork every beneficiary. cs.user_id is pinned per beneficiary — these
  -- functions are security definer and bypass RLS, so an unpinned UPDATE
  -- re-points EVERY user's progress into one person's copy (the same warning
  -- 0008 carries on fork_course).
  for v_beneficiary in
    select distinct cs.user_id
    from public.card_states cs
    join public.cards c on c.id = cs.card_id
    join public.decks d on d.id = c.deck_id
    where d.course_id = p_course_id
      and cs.user_id <> auth.uid()
  loop
    perform public.copy_course_for_user(p_course_id, v_beneficiary);

    delete from public.course_subscriptions
      where user_id = v_beneficiary and course_id = p_course_id;
    delete from public.deck_subscriptions ds
      using public.decks d
      where ds.user_id = v_beneficiary
        and ds.deck_id = d.id
        and d.course_id = p_course_id;
  end loop;

  -- Delete the course's decks (cards cascade). Owner's own states cascade
  -- away — they chose to delete their own progress. Every foreign state was
  -- re-pointed above, so the protect trigger passes.
  delete from public.decks where course_id = p_course_id;

  -- Finally the course itself. course_subscriptions cascade with it; notes
  -- orphan (notes.course_id is on delete set null) — notes hold no progress,
  -- and orphaning is the schema's faithful reading of "deletes the course".
  delete from public.courses where id = p_course_id;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Direct DELETE policy + grant
-- ---------------------------------------------------------------------------
-- Owner-only. The app calls delete_course() (the auto-fork path); this policy
-- makes a direct owner DELETE legal for tooling, mirroring the decks/cards
-- DELETE grants. courses.deleted_at is left in place but unused (ADR-002 §11):
-- dropping it would be churn on a column three RLS policies filter on, and a
-- later phase must not build a second, soft-delete path beside this one.
create policy courses_delete_own on courses
  for delete to authenticated
  using (owner_id = auth.uid());

grant delete on public.courses to authenticated;
