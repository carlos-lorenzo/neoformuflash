-- ============================================================================
-- Phase 00 — Foundation
--
-- Identity and taxonomy only: institutions, degrees, profiles, and the
-- moderation queue behind the "my university isn't listed" path at signup.
--
-- Everything else in specs/01-contracts.md (courses, notes, decks, cards,
-- card_states, review_logs, …) lands in phase 01. Adding it here would mean
-- shipping RLS policies for tables no code reads yet, which is how a policy
-- gets written wrong and stays wrong.
-- ============================================================================

create extension if not exists citext;

-- ============ taxonomy ============
-- Institution and degree are TABLES, not free-text columns (decision 2).
-- As normalised rows with slugs, V2's "browse by university" is a query rather
-- than a migration plus a data-cleanup project. A text column here would mean
-- 400 spellings of "Universitat Politècnica de València" by the time it matters.

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

create index degrees_institution_idx on degrees (institution_id);

-- ============ identity ============
create table profiles (
  id             uuid primary key references auth.users(id) on delete cascade,
  -- slug is the URL. Generated once from the Google account, IMMUTABLE forever
  -- (trigger below). A URL that changes when someone tidies their name is a
  -- link that breaks in a WhatsApp group six months later.
  slug           citext not null unique check (slug ~ '^[a-z0-9][a-z0-9_-]{2,29}$'),
  -- handle is the @name shown in the UI. Seeded from Google, user-editable.
  handle         citext not null unique check (handle ~ '^[a-z0-9][a-z0-9_-]{2,29}$'),
  display_name   text not null,
  avatar_url     text,
  -- INTERFACE language, not content language (decision 7). Defaults to 'en' as
  -- the fallback for a visitor we know nothing about; a Spanish browser still
  -- gets Spanish via Accept-Language, which is the common path in practice.
  locale         text not null default 'en' check (locale in ('es','en','ca')),
  institution_id uuid references institutions(id) on delete set null,
  degree_id      uuid references degrees(id) on delete set null,
  is_pro         boolean not null default false,
  desired_retention real not null default 0.90 check (desired_retention between 0.70 and 0.98),
  created_at     timestamptz not null default now()
);

create index profiles_institution_idx on profiles (institution_id);

-- ============ moderation queue ============
-- The "my university isn't listed" path writes HERE, never to institutions.
-- Letting signup create institution rows directly is how the taxonomy that
-- decision 2 exists to protect fills up with duplicates and typos on day one.
create table institution_requests (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references profiles(id) on delete cascade,
  name       text not null check (length(btrim(name)) between 1 and 120),
  country    char(2),
  status     text not null default 'pending' check (status in ('pending','accepted','rejected')),
  -- set when a moderator accepts the request and creates the real row
  resolved_institution_id uuid references institutions(id) on delete set null,
  created_at timestamptz not null default now()
);

create index institution_requests_pending_idx
  on institution_requests (created_at desc) where status = 'pending';

-- ============================================================================
-- Slug immutability
--
-- Policies control WHO may write; triggers control WHAT a write may contain.
-- This is a trigger for that reason (decision 6).
-- ============================================================================
create function reject_slug_change() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  if new.slug is distinct from old.slug then
    raise exception 'slug is immutable';
  end if;
  return new;
end $$;

create trigger profiles_slug_immutable
  before update on profiles
  for each row execute function reject_slug_change();

-- ============================================================================
-- Slug generation
-- ============================================================================
create function slugify(p_input text) returns text
  language sql
  immutable
  set search_path = ''
as $$
  -- unaccent() is not available without the extension, so fold via NFD:
  -- strip combining marks after normalisation. "José Martínez-Peña" -> "jose-martinez-pena".
  select trim(both '-' from
    regexp_replace(
      regexp_replace(
        lower(normalize(p_input, nfd)),
        '[̀-ͯ]', '', 'g'          -- drop combining diacritics
      ),
      '[^a-z0-9]+', '-', 'g'                 -- everything else becomes a separator
    )
  );
$$;

-- Normalise a display name into a valid slug base, falling back to a generated
-- one. A name in a non-Latin script slugifies to nothing, and a 1-2 character
-- name fails the >=3 check constraint. Both get a generated base rather than an
-- error — a student called 李明 must be able to finish signing up.
create function profile_slug_base(p_base text) returns text
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

  return left(v_base, 24);
end $$;

-- Read-only "what slug would this name get". Used by tests and by nothing on
-- the signup path: it reports a slug that was free a moment ago, which is not
-- the same as one you can insert. Use create_profile() to actually claim one.
create function claim_profile_slug(p_base text) returns text
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_base      text := public.profile_slug_base(p_base);
  v_candidate text := v_base;
  v_suffix    integer := 1;
begin
  loop
    exit when not exists (select 1 from public.profiles p where p.slug = v_candidate);
    v_suffix := v_suffix + 1;
    v_candidate := v_base || '-' || v_suffix::text;
    if v_suffix > 9999 then
      return 'user-' || replace(gen_random_uuid()::text, '-', '');
    end if;
  end loop;

  return left(v_candidate, 30);
end $$;

-- ============================================================================
-- create_profile — the only supported way to finish signup.
--
-- The retry loop around the INSERT is the whole point. "Pick a free slug, then
-- insert it" leaves a window between the check and the write that two people
-- signing up in the same second will eventually land in; the loser gets a 500
-- at the last step of onboarding, unreproducibly, in production.
--
-- (This is not hypothetical. The first version of this schema did exactly that,
-- and two parallel Playwright workers hit it on the first full run.)
--
-- Here the uniqueness test IS the insert: the unique index rejects the write,
-- we take the next suffix, and try again. The id comes from auth.uid() rather
-- than an argument, so a caller cannot create a profile for someone else.
-- ============================================================================
create function create_profile(
  p_display_name   text,
  p_avatar_url     text,
  p_locale         text,
  p_institution_id uuid,
  p_degree_id      uuid
) returns public.profiles
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_user_id    uuid := auth.uid();
  v_base       text;
  v_candidate  text;
  v_suffix     integer := 1;
  v_constraint text;
  v_row        public.profiles;
begin
  if v_user_id is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if exists (select 1 from public.profiles p where p.id = v_user_id) then
    raise exception 'profile already exists' using errcode = '23505';
  end if;

  v_base := public.profile_slug_base(p_display_name);
  v_candidate := v_base;

  loop
    begin
      insert into public.profiles
        (id, slug, handle, display_name, avatar_url, locale, institution_id, degree_id)
      values
        (v_user_id, v_candidate, v_candidate, p_display_name, p_avatar_url,
         coalesce(p_locale, 'en'), p_institution_id, p_degree_id)
      returning * into v_row;

      return v_row;

    exception when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;

      -- Only a slug/handle collision is retryable. A primary-key collision
      -- means this user already has a profile, and retrying would spin.
      if v_constraint = 'profiles_pkey' then
        raise exception 'profile already exists' using errcode = '23505';
      end if;

      v_suffix := v_suffix + 1;
      if v_suffix > 9999 then
        v_candidate := 'user-' || replace(gen_random_uuid()::text, '-', '');
      else
        v_candidate := left(v_base || '-' || v_suffix::text, 30);
      end if;
    end;
  end loop;
end $$;

-- ============================================================================
-- RLS. Every table has it. A new table without a policy is a bug.
-- ============================================================================
alter table institutions         enable row level security;
alter table degrees              enable row level security;
alter table profiles             enable row level security;
alter table institution_requests enable row level security;

-- Taxonomy is public read, service-role write. Signup needs to list
-- universities before a session exists, so this is readable by anon too.
create policy institutions_public_read on institutions
  for select to anon, authenticated using (true);

create policy degrees_public_read on degrees
  for select to anon, authenticated using (true);

-- Profiles: own row only, for now.
-- Public profile pages are phase 04 and will add a deliberate read policy then.
-- Opening this early would expose every user's institution and locale to anyone
-- who can guess a uuid, in exchange for nothing this phase needs.
create policy profiles_select_own on profiles
  for select to authenticated using ((select auth.uid()) = id);

create policy profiles_insert_own on profiles
  for insert to authenticated with check ((select auth.uid()) = id);

create policy profiles_update_own on profiles
  for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- No delete policy: account deletion cascades from auth.users, and a stray
-- client-side delete of a profile row would orphan content in later phases.

-- The moderation queue is write-only from the user's side: you may file a
-- request and see your own, never anyone else's, and never edit one after the
-- fact (which would let you change what a moderator is about to approve).
create policy institution_requests_insert_own on institution_requests
  for insert to authenticated with check ((select auth.uid()) = user_id);

create policy institution_requests_select_own on institution_requests
  for select to authenticated using ((select auth.uid()) = user_id);

-- ============================================================================
-- Grants. RLS filters rows; grants decide whether the table is reachable at all.
-- ============================================================================
grant select on institutions, degrees to anon, authenticated;
grant select, insert, update on profiles to authenticated;
grant select, insert on institution_requests to authenticated;

grant execute on function claim_profile_slug(text) to authenticated;
grant execute on function slugify(text) to authenticated;
grant execute on function create_profile(text, text, text, uuid, uuid) to authenticated;

-- service_role bypasses RLS but still needs the table grant. Stated explicitly
-- rather than relying on default privileges, so the reachable surface of each
-- role is readable in one place. Per specs/01-contracts.md this role is used in
-- exactly two places — migrations and the Stripe webhook — plus the RLS suite,
-- which needs it to seed the fixtures it then proves are inaccessible.
grant all on institutions, degrees, profiles, institution_requests to service_role;
grant execute on function claim_profile_slug(text), slugify(text), profile_slug_base(text) to service_role;
grant execute on function create_profile(text, text, text, uuid, uuid) to service_role;
