'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { SignupProfileInput, isLocale, DEFAULT_LOCALE } from '@neoformuflash/contracts';
import { LOCALE_COOKIE } from '@/lib/i18n/locale';
import { createProfile, hasProfile } from '@/lib/db/profiles';
import { getSessionUser } from '@/lib/supabase/session';

/*
 * Field-keyed errors. The values are message-catalog keys, never prose — the
 * UI translates them, so a Spanish student sees a Spanish validation error.
 */
export type OnboardingState = {
  errors: Record<string, string>;
};

export async function submitOnboarding(
  _previous: OnboardingState,
  formData: FormData
): Promise<OnboardingState> {
  const user = await getSessionUser();
  if (!user) redirect('/login');

  // Re-check rather than trusting the page that rendered the form: a second
  // submit from a stale tab must not attempt a duplicate profile insert.
  if (await hasProfile(user.id)) redirect('/app');

  const institutionId = asString(formData.get('institutionId'));
  const institutionOther = asString(formData.get('institutionOther'));
  const localeValue = asString(formData.get('locale'));

  const parsed = SignupProfileInput.safeParse({
    displayName: asString(formData.get('displayName')) ?? '',
    institutionId,
    // The two paths are mutually exclusive; whichever the student did not use
    // must be null, not an empty string, or both refinements misfire.
    institutionOther: institutionId ? null : institutionOther,
    degreeId: institutionId ? asString(formData.get('degreeId')) : null,
    locale: isLocale(localeValue) ? localeValue : DEFAULT_LOCALE,
  });

  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0];
      if (typeof field === 'string' && !errors[field]) errors[field] = issue.message;
    }
    return { errors };
  }

  const result = await createProfile(user.id, parsed.data, {
    avatarUrl: readAvatarUrl(user.user_metadata),
  });

  if (!result.ok) {
    return { errors: { form: result.code } };
  }

  // Write the profile's locale through to the cookie so the resolver agrees
  // with the database from the very next request, without a per-request query.
  const cookieStore = await cookies();
  cookieStore.set(LOCALE_COOKIE, parsed.data.locale, {
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
    path: '/',
  });

  redirect('/app');
}

function asString(value: FormDataEntryValue | null): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/** Google supplies the avatar under one of two keys depending on the flow. */
function readAvatarUrl(metadata: Record<string, unknown> | undefined): string | null {
  const candidate = metadata?.['avatar_url'] ?? metadata?.['picture'];
  return typeof candidate === 'string' ? candidate : null;
}
