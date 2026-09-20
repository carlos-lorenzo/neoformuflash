-- ============================================================================
-- Practice mode: study without affecting FSRS scheduling.
--
-- A practice grade must NEVER touch card_states or review_logs (the FSRS
-- optimizer reads review_logs; polluting it would corrupt future schedules).
-- Practice history lives in its own append-only table so it can be shown
-- ("you practiced 12 cards") without influencing due dates.
--
-- Streak still counts (user decision): the shared bump_streak() trigger is
-- generic over NEW.user_id / NEW.reviewed_at, so a second trigger on this
-- table reuses it with no duplication.
-- ============================================================================

begin;

create table public.practice_logs (
  id          bigserial primary key,
  user_id     uuid not null references profiles(id) on delete cascade,
  card_id     uuid not null references cards(id) on delete cascade,
  rating      public.review_rating not null,
  reviewed_at timestamptz not null default now()
);
create index practice_logs_user_time_idx on practice_logs (user_id, reviewed_at desc);
create index practice_logs_card_idx      on practice_logs (user_id, card_id, reviewed_at asc);

alter table public.practice_logs enable row level security;

create policy practice_logs_select_own on practice_logs
  for select to authenticated using (user_id = auth.uid());
create policy practice_logs_insert_own on practice_logs
  for insert to authenticated with check (user_id = auth.uid());

grant select on practice_logs to authenticated;
grant insert (user_id, card_id, rating) on practice_logs to authenticated;

-- service_role bypasses RLS but still needs the table grant (0007 discipline).
grant all on practice_logs to service_role;

-- No update, no delete, no truncate for authenticated (append-only, like review_logs).
revoke truncate on practice_logs from anon, authenticated;

-- Streak counts for practice too; scheduling untouched.
create trigger practice_logs_bump_streak
  after insert on public.practice_logs
  for each row execute function public.bump_streak();

commit;
