-- ============ public profile read policy ============
-- Phase 00 created `profiles` with owner-only SELECT (0001 §RLS).
-- Phase 04 opens a deliberate public read path: profile row is readable
-- when the user has at least one public/unlisted course or note.
-- The policy is intentionally narrow — no email, no institution, no degree,
-- no is_pro, no keyboard_shortcuts_enabled. Only what the public page needs.

create policy profiles_select_public on profiles
  for select to anon, authenticated
  using (
    exists (
      select 1 from public.courses c
      where c.owner_id = profiles.id
        and c.visibility <> 'private'
        and c.deleted_at is null
    )
    or
    exists (
      select 1 from public.notes n
      where n.owner_id = profiles.id
        and n.visibility <> 'private'
        and (n.visibility <> 'public' or n.published_at is not null)
        and (n.course_id is null
             or exists (select 1 from public.courses c
                        where c.id = n.course_id
                          and c.visibility <> 'private'
                          and c.deleted_at is null))
    )
  );

-- Column grants for the public profile columns only.
-- avatar_url, display_name, handle, locale, slug are the public surface.
-- institution_id, degree_id, is_pro, keyboard_shortcuts_enabled stay private.
--
-- `id` is granted to anon as well, for two reasons. The public profile page
-- reads it to list that owner's public courses and notes — without it the
-- page cannot resolve a handle to its content and every profile 500s. And it
-- discloses nothing new: `courses.owner_id` and `notes.owner_id` are already
-- anon-readable on any public row, so the uuid of a user with public content
-- is reachable regardless. Withholding it here bought no privacy, only a
-- broken page. The rows anon can see are still bounded by the policy above.
grant select (id, slug, handle, display_name, avatar_url, locale)
  on public.profiles to anon, authenticated;

-- ============ SEO metadata columns on notes ============
-- Open Graph / Twitter card tags rendered from these columns.
-- Nullable — if absent, the page falls back to title + content_text excerpt.

alter table public.notes
  add column og_title text,
  add column og_description text,
  add column og_image_url text;

-- ============ RLS: the existing notes_select_public policy already
-- enforces the correct visibility containment (note + parent course).
-- No new policy needed; the public route uses the same SELECT.

-- ============ Column grants for SEO columns on notes ============
-- Owner can update SEO fields; anon/authenticated can read them for public notes.
grant update (og_title, og_description, og_image_url)
  on public.notes to authenticated;

grant select (og_title, og_description, og_image_url)
  on public.notes to anon, authenticated;