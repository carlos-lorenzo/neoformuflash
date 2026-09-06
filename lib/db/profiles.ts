import type { Locale, SignupProfileInput } from '@neoformuflash/contracts';
import type { PublicProfile, PublicCourse, PublicNote, NoteDoc } from '@neoformuflash/contracts';
import { err, ok, type Result } from '@/lib/result';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/*
 * All profile data access. Per CLAUDE.md there are no Supabase calls inside
 * components — everything goes through here.
 */

export type Profile = {
  id: string;
  slug: string;
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  locale: Locale;
  institutionId: string | null;
  degreeText: string | null;
  isPro: boolean;
  keyboardShortcutsEnabled: boolean;
};

/*
 * The full profile for a user. The shape distinguishes three outcomes:
 *   ok(profile) — row exists and reads.
 *   ok(null)    — no row yet, the onboarding path.
 *   err(...)    — the query itself failed (schema drift, RLS, transient).
 * A caller must not treat `err` like "no profile": the row can still exist,
 * and redirecting to /onboarding would then bounce straight back — the exact
 * infinite loop this Result exists to prevent.
 */
export async function getProfile(userId: string): Promise<Result<Profile | null>> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from('profiles')
    .select('id, slug, handle, display_name, avatar_url, locale, institution_id, degree_text, is_pro, keyboard_shortcuts_enabled')
    .eq('id', userId)
    .maybeSingle();

  if (error) return err('error.unexpected', error);
  if (!data) return ok(null);

  return ok({
    id: data.id,
    slug: data.slug,
    handle: data.handle,
    displayName: data.display_name,
    avatarUrl: data.avatar_url,
    locale: data.locale as Locale,
    institutionId: data.institution_id,
    degreeText: data.degree_text,
    isPro: data.is_pro,
    keyboardShortcutsEnabled: data.keyboard_shortcuts_enabled,
  });
}

/** Cheap existence check for the callback and middleware redirect decisions. */
export async function hasProfile(userId: string): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from('profiles').select('id').eq('id', userId).maybeSingle();
  return data !== null;
}

/**
 * Create the profile row at the end of onboarding.
 *
 * Everything happens inside `create_profile`, which retries the INSERT itself
 * on a slug collision. Claiming a slug here and inserting it separately leaves
 * a window two concurrent signups can land in — the loser gets a 500 on the
 * last step of onboarding. The user id comes from `auth.uid()` inside the
 * function, not from this argument, so a caller cannot create someone else's
 * profile even if this code were wrong.
 */
export async function createProfile(
  /*
   * Unused since the institution_requests write was removed: the id the
   * profile is created for comes from auth.uid() INSIDE create_profile(), not
   * from this argument, so a caller cannot create someone else's profile even
   * if this code were wrong. Kept in the signature to keep call sites honest
   * about whose profile they think they are creating.
   */
  _userId: string,
  input: SignupProfileInput,
  seed: { avatarUrl: string | null }
): Promise<Result<Profile>> {
  const supabase = await createSupabaseServerClient();

  /*
   * `supabase gen types` renders every function parameter as non-nullable,
   * because a Postgres signature does not record nullability — but avatar_url,
   * institution_name and degree_text are all genuinely optional here. The cast
   * is confined to this object rather than loosening the function's return
   * type, which stays fully checked below.
   */
  const args = {
    p_display_name: input.displayName,
    p_avatar_url: seed.avatarUrl,
    p_locale: input.locale,
    p_institution_name: input.institutionName,
    p_degree_text: input.degreeText,
  } as unknown as Parameters<typeof supabase.rpc<'create_profile'>>[1];

  const { data, error } = await supabase.rpc('create_profile', args);

  if (error || !data) return err('error.unexpected', error);

  /*
   * There is no longer a moderation write here. The "my university isn't
   * listed" path used to file an `institution_requests` row for a human to
   * approve; now any typed name resolves to a real institution row inside
   * create_profile(), so there is nothing to queue. The table and its policies
   * survive for the pending requests filed before this change.
   */

  return ok({
    id: data.id,
    slug: data.slug,
    handle: data.handle,
    displayName: data.display_name,
    avatarUrl: data.avatar_url,
    locale: data.locale as Locale,
    institutionId: data.institution_id,
    degreeText: data.degree_text,
    isPro: data.is_pro,
    keyboardShortcutsEnabled: data.keyboard_shortcuts_enabled,
  });
}

export async function updateProfileLocale(userId: string, locale: Locale): Promise<Result<null>> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from('profiles').update({ locale }).eq('id', userId);
  return error ? err('error.unexpected', error) : ok(null);
}

/* ------------------------------------------------------------------ */
/*  Public profile access (phase 04)                                  */
/* ------------------------------------------------------------------ */

const PUBLIC_PROFILE_SELECT = 'id, slug, handle, display_name, avatar_url, locale';

function toPublicProfile(row: Record<string, unknown>): PublicProfile {
  return {
    id: row.id as string,
    slug: row.slug as string,
    handle: row.handle as string,
    displayName: row.display_name as string,
    avatarUrl: (row.avatar_url as string | null) ?? null,
    locale: row.locale as PublicProfile['locale'],
  };
}

/**
 * Get a public profile by handle. Returns null if the profile doesn't exist
 * or has no public content (the RLS policy filters these out).
 */
export async function getPublicProfile(handle: string): Promise<Result<PublicProfile | null>> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from('profiles')
    .select(PUBLIC_PROFILE_SELECT)
    .eq('handle', handle)
    .maybeSingle();

  if (error) return err('error.unexpected', error);
  if (!data) return ok(null);

  return ok(toPublicProfile(data));
}

/**
 * List public/unlisted courses for a profile owner.
 * Only courses with visibility <> 'private' and deleted_at IS NULL.
 */
export async function listPublicCoursesByOwner(ownerId: string): Promise<Result<PublicCourse[]>> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from('courses')
    .select('id, owner_id, slug, name, code, subscriber_count, fork_count')
    .eq('owner_id', ownerId)
    .neq('visibility', 'private')
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (error) return err('error.unexpected', error);

  return ok(
    (data ?? []).map((row) => ({
      id: row.id,
      ownerId: row.owner_id,
      slug: row.slug,
      name: row.name,
      code: row.code,
      subscriberCount: row.subscriber_count,
      forkCount: row.fork_count,
    })),
  );
}

/**
 * List published public/unlisted notes for a profile owner.
 * Respects the same visibility containment as notes_select_public.
 */
export async function listPublicNotesByOwner(ownerId: string): Promise<Result<PublicNote[]>> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from('notes')
    .select(`
      id, slug, title, content_text, content_json, language, og_title, og_description, og_image_url, published_at,
      course:courses(id, slug, name, visibility, deleted_at)
    `)
    .eq('owner_id', ownerId)
    .neq('visibility', 'private')
    .not('published_at', 'is', null) // published_at IS NOT NULL for 'public' notes
    // Left join, not !inner: a note with no course is still public.
    // The filter must be scoped with referencedTable, or PostgREST parses
    // `course.visibility` as a column on `notes` and rejects the logic tree.
    .or('visibility.neq.private,visibility.is.null', { referencedTable: 'course' })
    .is('course.deleted_at', null)
    .order('published_at', { ascending: false });

  if (error) return err('error.unexpected', error);

  return ok(
    (data ?? []).map((row) => {
      const courseInfo = (row.course ?? null) as
        | { id: string; slug: string; name: string; visibility: string; deleted_at: string | null }
        | null;

      return {
        id: row.id,
        slug: row.slug,
        title: row.title,
        contentText: row.content_text,
        contentJson: row.content_json as unknown as NoteDoc,
        language: row.language,
        ogTitle: row.og_title,
        ogDescription: row.og_description,
        ogImageUrl: row.og_image_url,
        publishedAt: row.published_at,
        course: courseInfo
          ? {
              id: courseInfo.id,
              slug: courseInfo.slug,
              name: courseInfo.name,
            }
          : null,
      };
    }),
  );
}
