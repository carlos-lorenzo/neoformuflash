-- ============================================================================
-- Phase 03: review engine.
--
-- Numbered 0010, not 0009 as the spec's SQL block says: 0009 was taken by
-- phase 00b's `keyboard_shortcuts` migration, which is already applied to the
-- hosted database (EVOLUTION 2026-08-06). Renaming an applied migration would
-- rewrite history that a live database has already consumed.
--
-- Three changes, one concern each:
--   1. cards.confidence  — author-set difficulty hint on the review_rating scale
--   2. undo_review()     — reverse the most recent review of one card
--   3. bump_streak()     — maintain streaks atomically with a review
-- ============================================================================

begin;

-- ============ 1. author-set confidence ============
-- NULL = unset. The card editor defaults new cards to 'good'. The enum's
-- declaration order (again < hard < good < easy, from 0003) is the card-list
-- sort key, so `order by confidence` sorts hardest-first without a CASE.
--
-- No `revoke all` precedes the grant: ALTER TABLE ADD COLUMN does not re-run
-- pg_default_acl (that applies to newly *created* objects), so this column
-- inherits `cards`' existing ACL from 0007 — which grants authenticated only
-- the columns 0007 names. The grant below is therefore the only new privilege,
-- and tests/db/grants.test.ts asserts it is exactly UPDATE and nothing wider.
alter table public.cards add column confidence public.review_rating;

grant update (confidence) on public.cards to authenticated;

-- Author-set confidence is part of card *content*, so a subscriber pulling the
-- deck sees the author's hint. It is deliberately NOT in the insert grant's
-- shape check anywhere — 0007's cards_insert_own policy governs the row.
grant insert (confidence) on public.cards to authenticated;


-- ============ 2. undo the most recent review ============
-- The pre-review stability, difficulty and phase are NOT taken from the
-- caller. review_logs already records them (`review_stability`,
-- `review_difficulty`, `phase` = the state BEFORE that review, per 0004), so
-- the row being deleted IS the authoritative snapshot. Trusting a
-- client-supplied state here would let a caller write an arbitrary schedule
-- into their own card_states — self-harm only under RLS, but an unvalidated
-- write path with no reason to exist.
--
-- p_prev supplies only what the log does not carry: learning_steps, reps,
-- lapses, due_at and last_reviewed_at. Each is clamped to its CHECK domain so
-- a malformed payload cannot violate a constraint or park a card in 2099.
--
-- First-review case: if no review_logs row remains for this (user, card) after
-- the delete, the card had no card_states row before that review (rows are
-- created lazily on first review, ADR-002 decision 8 / the phase-01 queue), so
-- the correct undo is to remove the row entirely and return the card to `new`.
-- Restoring it instead would write review_difficulty = 0.0 — a legal PRE-review
-- value per 0004, but one that violates card_states' `difficulty between 1.0
-- and 10.0` CHECK, since that column only ever holds POST-review values.
create function public.undo_review(p_card_id uuid, p_prev jsonb)
  returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_user_id   uuid := auth.uid();
  v_log       public.review_logs;
  v_remaining integer;
begin
  if v_user_id is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select * into v_log
    from public.review_logs
   where user_id = v_user_id and card_id = p_card_id
   order by reviewed_at desc, id desc
   limit 1;
  if not found then
    raise exception 'nothing to undo' using errcode = 'P0002';
  end if;

  delete from public.review_logs where id = v_log.id;

  select count(*) into v_remaining
    from public.review_logs
   where user_id = v_user_id and card_id = p_card_id;

  if v_remaining = 0 then
    -- That was the card's first review: there was no state before it.
    delete from public.card_states
     where user_id = v_user_id and card_id = p_card_id;
    return;
  end if;

  update public.card_states
     set stability        = greatest(v_log.review_stability, 0),
         difficulty       = least(greatest(v_log.review_difficulty, 1.0), 10.0),
         phase            = v_log.phase,
         learning_steps   = greatest(coalesce((p_prev #>> '{learningSteps}')::integer, 0), 0),
         reps             = greatest(coalesce((p_prev #>> '{reps}')::integer, 0), 0),
         lapses           = greatest(coalesce((p_prev #>> '{lapses}')::integer, 0), 0),
         due_at           = coalesce((p_prev #>> '{dueAt}')::timestamptz, now()),
         last_reviewed_at = (p_prev #>> '{lastReviewedAt}')::timestamptz
   where user_id = v_user_id and card_id = p_card_id;
end $$;

revoke execute on function public.undo_review(uuid, jsonb) from public;
grant execute on function public.undo_review(uuid, jsonb) to authenticated, service_role;


-- ============ 3. streaks ============
-- No trigger existed in 0004; the app was supposed to own it, which makes the
-- streak a second write that can fail independently of the review. A trigger
-- on review_logs INSERT keeps it atomic with apply_review instead.
--
-- "Day" is NEW.reviewed_at::date, i.e. the UTC day. A non-UTC student
-- reviewing late at night crosses the boundary early — accepted for MVP and
-- recorded in the phase spec's Risks.
--
-- Undo does not decrement the streak: there is no trigger on DELETE. Rare,
-- cosmetic, and reversing it correctly would need the day's remaining review
-- count, which the streak row does not carry.
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
      when streaks.last_active_date = v_day     then streaks.current_streak
      when streaks.last_active_date = v_day - 1 then streaks.current_streak + 1
      else 1
    end,
    longest_streak = greatest(
      streaks.longest_streak,
      case
        when streaks.last_active_date = v_day     then streaks.current_streak
        when streaks.last_active_date = v_day - 1 then streaks.current_streak + 1
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
