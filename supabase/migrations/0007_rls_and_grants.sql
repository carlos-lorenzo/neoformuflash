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
