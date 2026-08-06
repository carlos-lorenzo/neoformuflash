import type { Locale, SignupProfileInput } from '@neoformuflash/contracts';
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
  degreeId: string | null;
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
    .select('id, slug, handle, display_name, avatar_url, locale, institution_id, degree_id, is_pro, keyboard_shortcuts_enabled')
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
    degreeId: data.degree_id,
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
  userId: string,
  input: SignupProfileInput,
  seed: { avatarUrl: string | null }
): Promise<Result<Profile>> {
  const supabase = await createSupabaseServerClient();

  /*
   * `supabase gen types` renders every function parameter as non-nullable,
   * because a Postgres signature does not record nullability — but avatar_url,
   * institution_id and degree_id are all genuinely optional here. The cast is
   * confined to this object rather than loosening the function's return type,
   * which stays fully checked below.
   */
  const args = {
    p_display_name: input.displayName,
    p_avatar_url: seed.avatarUrl,
    p_locale: input.locale,
    p_institution_id: input.institutionId,
    p_degree_id: input.degreeId,
  } as unknown as Parameters<typeof supabase.rpc<'create_profile'>>[1];

  const { data, error } = await supabase.rpc('create_profile', args);

  if (error || !data) return err('error.unexpected', error);

  // The "my university isn't listed" path files a moderation request. It runs
  // after the profile insert so a failure here cannot block someone signing up
  // over a nice-to-have.
  if (input.institutionOther) {
    const { error: requestError } = await supabase
      .from('institution_requests')
      .insert({ user_id: userId, name: input.institutionOther, country: 'ES' });

    if (requestError) {
      console.error('institution_request insert failed', requestError);
    }
  }

  return ok({
    id: data.id,
    slug: data.slug,
    handle: data.handle,
    displayName: data.display_name,
    avatarUrl: data.avatar_url,
    locale: data.locale as Locale,
    institutionId: data.institution_id,
    degreeId: data.degree_id,
    isPro: data.is_pro,
    keyboardShortcutsEnabled: data.keyboard_shortcuts_enabled,
  });
}

export async function updateProfileLocale(userId: string, locale: Locale): Promise<Result<null>> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from('profiles').update({ locale }).eq('id', userId);
  return error ? err('error.unexpected', error) : ok(null);
}
