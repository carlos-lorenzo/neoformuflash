-- ============================================================================
-- Phase 03d — Open the signup taxonomy
--
-- ADR-002 decision 2 made institution and degree normalised TABLES so that
-- "browse by university" would be a query rather than a data-cleanup project.
-- The cost landed on the wrong side of the trade: the list held 27 Spanish
-- universities, so every student outside it had to find an "other" escape
-- hatch which then HID the degree field entirely (SignupProfileInput refuses a
-- degree without an institution). The taxonomy became the thing standing
-- between real users and an account.
--
-- What changes:
--   * institution is free text, matched fuzzily against rows that already
--     exist and creating a new row when it does not. Worldwide, no seed.
--   * degree is a plain text column on profiles. No table, no coupling.
--   * both are OPTIONAL. Signup is never blocked on either.
--
-- What deliberately does NOT change: the `institutions` and `degrees` TABLES
-- both survive, because `courses.institution_id` and `courses.degree_id` hold
-- live foreign keys into them. Only the signup path is rewritten.
--
-- Accepted consequence, stated plainly: allowing any caller to create an
-- institution row reopens exactly the duplicate/typo problem decision 2 was
-- written to prevent. find_or_create_institution() folds case and slugifies to
-- blunt it, but "Univ. of Bath" and "University of Bath" will be two rows. A
-- future merge tool is the answer, not a closed list.
-- ============================================================================

-- Trigram matching is what makes the search tolerant of a typo or a partial
-- name. A plain ILIKE '%q%' is a substring test, not a fuzzy one, and it
-- cannot rank.
create extension if not exists pg_trgm;

create index institutions_name_trgm_idx
  on public.institutions using gin (name gin_trgm_ops);

-- A student typing their own university supplies no ISO country code, and we
-- are not going to guess one from the name.
alter table public.institutions alter column country drop not null;

-- ============================================================================
-- profiles.degree_id -> profiles.degree_text
--
-- Nothing else references profiles.degree_id. `courses.degree_id` is a
-- different column on a different table and is untouched, which is why the
-- `degrees` table cannot simply be dropped.
--
-- Dropping the column also drops the column-level UPDATE grant 0002 issued for
-- it, so the replacement column has to be granted by name below. Per 0002's
-- own rule: a new column on a user-writable table is NOT writable until a
-- migration names it.
-- ============================================================================
alter table public.profiles add column degree_text text
  check (degree_text is null or length(btrim(degree_text)) between 1 and 120);

alter table public.profiles drop column degree_id;

grant update (degree_text) on public.profiles to authenticated;

-- ============================================================================
-- find_or_create_institution
--
-- Case-insensitive find, else insert. The retry-on-unique-violation loop is
-- the same shape as create_profile()'s and exists for the same reason: a
-- check-then-insert leaves a window that two people signing up in the same
-- second will land in, and the loser gets a 500 on the last step of onboarding.
-- Here the uniqueness test IS the insert.
--
-- `security definer` because `authenticated` has no insert grant on
-- institutions and must not get one — this function is the only write path.
-- ============================================================================
create function find_or_create_institution(p_name text) returns uuid
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_name       text := btrim(p_name);
  v_base       text;
  v_candidate  text;
  v_suffix     integer := 1;
  v_id         uuid;
begin
  if v_name is null or v_name = '' then
    return null;
  end if;

  if length(v_name) > 120 then
    raise exception 'institution name too long' using errcode = '22001';
  end if;

  -- Existing row wins, matched case- and accent-insensitively via the same
  -- slug function the insert would use. This is what keeps "UPV" typed by two
  -- students pointing at one row.
  v_base := public.slugify(v_name);

  if v_base is null or v_base = '' then
    -- A name in a non-Latin script slugifies to nothing. Give it a generated
    -- slug rather than rejecting it: a student at 東京大学 must be able to
    -- finish signing up.
    v_base := 'inst-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
  end if;

  v_base := left(v_base, 48);
  v_candidate := v_base;

  select i.id into v_id from public.institutions i where i.slug = v_candidate;
  if v_id is not null then
    return v_id;
  end if;

  loop
    begin
      insert into public.institutions (slug, name, country)
      values (v_candidate, v_name, null)
      returning id into v_id;

      return v_id;

    exception when unique_violation then
      -- Lost the race: someone inserted this exact slug between the select and
      -- the insert. Their row is the one we wanted, so take it.
      select i.id into v_id from public.institutions i where i.slug = v_candidate;
      if v_id is not null then
        return v_id;
      end if;

      v_suffix := v_suffix + 1;
      if v_suffix > 9999 then
        v_candidate := 'inst-' || replace(gen_random_uuid()::text, '-', '');
      else
        v_candidate := left(v_base || '-' || v_suffix::text, 60);
      end if;
    end;
  end loop;
end $$;

-- ============================================================================
-- institution_acronym — "MIT", "UPV", "TUM"
--
-- Trigram similarity is blind to acronyms: "MIT" shares almost no trigrams
-- with "Massachusetts Institute of Technology", and the prefix test fails too
-- because the name does not start with those letters. Yet an acronym is how
-- most students actually refer to their university, so without this the
-- type-ahead misses the single most likely query.
--
-- Words of 1-2 characters are skipped so connectives ("of", "de", "i", "der")
-- do not pollute the initials: "Universitat Politècnica de València" -> "UPV",
-- not "UPDV". Purely numeric words are skipped for the same reason — a year or
-- a campus number in the name ("Universidad 2000") is not part of how anyone
-- says the acronym out loud.
--
-- IMMUTABLE is honest here — it reads no table — which is what lets the
-- expression index below exist.
-- ============================================================================
create function institution_acronym(p_name text) returns text
  language sql
  immutable
  set search_path = ''
as $$
  select upper(string_agg(left(w, 1), '' order by ord))
  from regexp_split_to_table(btrim(coalesce(p_name, '')), '\s+')
       with ordinality as t(w, ord)
  where length(w) > 2
    and w ~ '[^0-9]';
$$;

create index institutions_acronym_idx
  on public.institutions (public.institution_acronym(name));

-- ============================================================================
-- search_institutions — the signup type-ahead
--
-- An RPC rather than a PostgREST query because the ordering is the point:
-- similarity() ranking cannot be expressed through the query builder, and
-- `ilike '%q%'` is a substring test that cannot match a typo ("politecnica"
-- vs "politècnica"), cannot tolerate word-order differences, and gives nothing
-- to sort by.
--
-- `stable`, not `volatile`, so the planner can use institutions_name_trgm_idx.
-- NOT `security definer`: this reads a table anon can already select from, so
-- it needs no elevation, and a definer function here would be a needlessly
-- privileged surface on the one endpoint reachable before login.
-- ============================================================================
create function search_institutions(
  p_query          text,
  p_limit          integer default 10,
  p_min_similarity real    default 0.1
) returns table (id uuid, slug text, name text)
  language sql
  stable
  set search_path = ''
as $$
  select i.id, i.slug, i.name
  from public.institutions i
  where btrim(coalesce(p_query, '')) <> ''
    and (
      -- Trigram similarity catches typos and reorderings; the prefix test
      -- catches the short queries ("MIT", "UPV") that similarity scores badly
      -- because a 3-character string shares few trigrams with a long name.
      public.similarity(i.name, p_query) >= p_min_similarity
      or i.name ilike btrim(p_query) || '%'
      -- Acronym match, e.g. "MIT" -> Massachusetts Institute of Technology.
      or public.institution_acronym(i.name) = upper(btrim(p_query))
    )
  order by
    -- An exact acronym is the most confident signal there is: someone typing
    -- "MIT" means one specific university, so it outranks everything.
    (public.institution_acronym(i.name) = upper(btrim(p_query))) desc,
    -- Then exact-prefix: someone typing "Universidad de Sev" wants Sevilla at
    -- the top, not whatever scores highest globally.
    (i.name ilike btrim(p_query) || '%') desc,
    public.similarity(i.name, p_query) desc,
    i.name asc
  limit greatest(1, least(coalesce(p_limit, 10), 50));
$$;

-- ============================================================================
-- create_profile — new signature
--
-- Takes the institution as free text and resolves it internally, so signup
-- stays ONE atomic RPC. Two round trips (create institution, then create
-- profile) would leave an orphan institution row whenever the second call
-- fails.
--
-- The retry loop, the auth.uid() id and the profiles_pkey special case are
-- carried over unchanged from 0001 — see that file for why each exists.
-- ============================================================================
create function create_profile(
  p_display_name     text,
  p_avatar_url       text,
  p_locale           text,
  p_institution_name text,
  p_degree_text      text
) returns public.profiles
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_user_id        uuid := auth.uid();
  v_institution_id uuid;
  v_degree         text := nullif(btrim(coalesce(p_degree_text, '')), '');
  v_base           text;
  v_candidate      text;
  v_suffix         integer := 1;
  v_constraint     text;
  v_row            public.profiles;
begin
  if v_user_id is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if exists (select 1 from public.profiles p where p.id = v_user_id) then
    raise exception 'profile already exists' using errcode = '23505';
  end if;

  if length(coalesce(v_degree, '')) > 120 then
    raise exception 'degree too long' using errcode = '22001';
  end if;

  -- Both fields are optional. A null or blank institution resolves to null
  -- rather than creating a row, so "skip" costs nothing.
  v_institution_id := public.find_or_create_institution(p_institution_name);

  v_base := public.profile_slug_base(p_display_name);
  v_candidate := v_base;

  loop
    begin
      insert into public.profiles
        (id, slug, handle, display_name, avatar_url, locale, institution_id, degree_text)
      values
        (v_user_id, v_candidate, v_candidate, p_display_name, p_avatar_url,
         coalesce(p_locale, 'en'), v_institution_id, v_degree)
      returning * into v_row;

      return v_row;

    exception when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;

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

drop function public.create_profile(text, text, text, uuid, uuid);

-- ============================================================================
-- EXECUTE privileges
--
-- Postgres grants EXECUTE on a new function to PUBLIC by default, so the
-- revoke is the load-bearing statement here and the grant is the narrow
-- re-open. 0001 shipped the grant without the revoke and `anon` inherited
-- access to every function via PUBLIC (EVOLUTION 2026-08-04).
--
-- find_or_create_institution WRITES, which makes an anonymous caller worse
-- than the read-only enumeration oracle that finding was about: it would be an
-- unauthenticated insert into a shared table.
-- ============================================================================
revoke execute on function
  find_or_create_institution(text),
  search_institutions(text, integer, real),
  institution_acronym(text),
  create_profile(text, text, text, text, text)
  from public;

grant execute on function create_profile(text, text, text, text, text) to authenticated;

-- Signup renders suggestions before a session exists, so this one is the
-- deliberate exception: readable by anon, exactly like the underlying table.
grant execute on function search_institutions(text, integer, real) to anon, authenticated;
-- The search function is `stable`, not `definer`, so the acronym helper it
-- calls must be executable by the same callers.
grant execute on function institution_acronym(text) to anon, authenticated;

-- Deliberately NOT granted to `authenticated`: institutions are only ever
-- created as a side effect of finishing signup. create_profile() is
-- `security definer`, so it calls this as the owner and the caller needs no
-- grant of its own.
grant execute on function
  find_or_create_institution(text),
  search_institutions(text, integer, real),
  institution_acronym(text),
  create_profile(text, text, text, text, text)
  to service_role;
