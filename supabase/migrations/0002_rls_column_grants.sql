-- ============================================================================
-- Phase 00 — column-level write privileges
--
-- No new tables, no new columns. This migration closes four privilege
-- escalations the security audit found in 0001, all of which were live and all
-- of which the RLS suite was green over.
--
-- The lesson, worth keeping: a policy authorises the ROW. Nothing in
-- `profiles_update_own` says which COLUMNS the update may name, so
-- `update profiles set is_pro = true where id = auth.uid()` satisfies it
-- perfectly. Row policies and column grants are different controls and 0001
-- only had one of them.
--
-- Rule for later phases: a new column on a user-writable table is NOT writable
-- by `authenticated` until a migration grants it by name. That default is the
-- point.
-- ============================================================================

-- ============================================================================
-- F3 + F4 — profiles
--
-- 0001 had `grant select, insert, update on profiles to authenticated`, which
-- is table-level. Two consequences:
--   F3  a user could set their own is_pro and skip payment entirely.
--   F4  a user could insert their profile row directly, choosing their own
--       slug (permanent, per the immutability trigger) and is_pro in one
--       statement, bypassing create_profile() completely.
-- ============================================================================
revoke insert, update on profiles from authenticated;

-- What onboarding and settings legitimately write, and nothing else.
-- Excluded deliberately:
--   id              — comes from auth.uid() inside create_profile()
--   slug            — immutable by trigger; the grant now agrees with it
--   is_pro          — billing writes this via service_role (F3)
--   desired_retention — service_role until phase 03 ships the control
--   created_at      — set once by the default
grant update (handle, display_name, avatar_url, locale, institution_id, degree_id)
  on profiles to authenticated;

-- No insert grant at all, so create_profile() is the only way a profile row is
-- created. That is what 0001's own comment says it intends; the policy below
-- was quietly offering a second, unguarded path.
--
-- create_profile() is `security definer` and owned by the same role that owns
-- `profiles`, so it inserts regardless of RLS and regardless of the caller's
-- grants. Dropping this policy therefore closes the direct path without
-- touching the supported one — tests/db/create-profile.test.ts is the proof.
drop policy profiles_insert_own on profiles;

-- ============================================================================
-- F5 — institution_requests
--
-- Same table-level grant, same shape of hole: a user could file a moderation
-- request with `status = 'accepted'` already set, or point
-- `resolved_institution_id` at an existing university. The queue decides its
-- own state; the requester supplies three fields and nothing more.
-- ============================================================================
revoke insert on institution_requests from authenticated;
grant insert (user_id, name, country) on institution_requests to authenticated;

-- Belt and braces, on purpose. The column grant already means a caller cannot
-- name `status`, so the default 'pending' applies. The WITH CHECK re-asserts it
-- against the row after defaults are applied, so this policy stays correct if a
-- later migration ever widens the grant again.
drop policy institution_requests_insert_own on institution_requests;
create policy institution_requests_insert_own on institution_requests
  for insert to authenticated
  with check ((select auth.uid()) = user_id
              and status = 'pending'
              and resolved_institution_id is null);

-- ============================================================================
-- F6 — function EXECUTE
--
-- Postgres grants EXECUTE on a new function to PUBLIC by default. 0001's
-- explicit `grant execute ... to authenticated` lines were therefore decorative
-- — they granted something the grantee already had via PUBLIC, and `anon`
-- inherited the same access. An anonymous caller could run claim_profile_slug()
-- in a loop and enumerate which slugs are taken, i.e. which users exist.
--
-- reject_slug_change() is deliberately left alone: it is a trigger function,
-- its privileges are checked when the trigger is created rather than when it
-- fires, so revoking there buys nothing and risks the immutability guard.
-- ============================================================================
revoke execute on function
  claim_profile_slug(text),
  slugify(text),
  profile_slug_base(text),
  create_profile(text, text, text, uuid, uuid)
  from public;

-- The only function a signed-in user needs. The other three are internals it
-- calls; because create_profile() is `security definer` they run as the owner,
-- so the caller never needs a grant on them.
grant execute on function create_profile(text, text, text, uuid, uuid) to authenticated;

grant execute on function
  claim_profile_slug(text),
  slugify(text),
  profile_slug_base(text),
  create_profile(text, text, text, uuid, uuid)
  to service_role;

-- ============================================================================
-- Reserved slugs
--
-- Phase 04 serves public profiles at /{slug}, and the immutability trigger
-- makes a squat permanent — a user who signs up as "Admin" today owns
-- /admin forever, and the only fix is a data migration plus a broken link.
-- Cheaper to reserve now than to reclaim later.
--
-- Exact match, not prefix: "administrator" and "helpdesk" are legitimate names
-- and should slugify untouched.
-- ============================================================================
create or replace function profile_slug_base(p_base text) returns text
  language plpgsql
  set search_path = ''
as $$
declare
  v_base text;
begin
  v_base := public.slugify(p_base);

  if v_base is null or length(v_base) < 3 then
    v_base := 'user-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
  end if;

  -- Routes this app owns, plus the channels a phishing page would want to
  -- impersonate. Suffixed rather than rejected, so a student genuinely called
  -- e.g. "Api" still finishes signing up.
  if v_base = any (array[
    'admin', 'support', 'help', 'billing', 'formuflash',
    'api', 'auth', 'login', 'logout', 'signup', 'onboarding',
    'settings', 'app', 'about', 'legal', 'privacy', 'terms',
    'new', 'edit', 'search', 'explore', 'static', 'assets'
  ]) then
    v_base := v_base || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 4);
  end if;

  return left(v_base, 24);
end $$;

-- `create or replace` preserves the existing owner and privileges, so the F6
-- revoke above still holds and these two lines are a no-op today. They are an
-- assertion, not a fix: if this function is ever rewritten as drop + create,
-- privileges DO reset to EXECUTE for PUBLIC, and these are what stops that from
-- silently reopening F6.
revoke execute on function profile_slug_base(text) from public;
grant execute on function profile_slug_base(text) to service_role;
