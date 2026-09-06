'use server';

import { cookies } from 'next/headers';
import { isLocale } from '@neoformuflash/contracts';
import { LOCALE_COOKIE, PSEUDO_LOCALE } from '@/lib/i18n/locale';
import { isShippedLocale } from '@/lib/i18n/shipped';
import { THEME_COOKIE, isThemeChoice } from '@/lib/theme';
import { updateProfileLocale } from '@/lib/db/profiles';
import { getSessionUser } from '@/lib/supabase/session';

/*
 * Theme and locale are preferences, not data, so they live in cookies and are
 * read during render. Both actions also persist to the profile when there is a
 * session, so the choice follows the student to a different browser.
 */

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export async function setTheme(value: string): Promise<void> {
  if (!isThemeChoice(value)) return;

  const cookieStore = await cookies();
  cookieStore.set(THEME_COOKIE, value, {
    maxAge: ONE_YEAR_SECONDS,
    sameSite: 'lax',
    path: '/',
  });
}

export async function setLocale(value: string): Promise<void> {
  // The pseudo-locale is a test instrument. It is accepted only where the
  // resolver would accept it, and never persisted to a profile.
  const isPseudo = value === PSEUDO_LOCALE && process.env.NODE_ENV !== 'production';

  // Gate on shipped rather than valid: `isLocale('ca')` is true (it is a real
  // profile value), but writing that cookie would crash the very next render
  // until the user hand-edited it back. If a request smuggles in an unshipped
  // locale, silently drop it — the picker never offers one, so the only source
  // is a crafted request.
  if (!isPseudo && !isShippedLocale(value)) return;

  const cookieStore = await cookies();
  cookieStore.set(LOCALE_COOKIE, value, {
    maxAge: ONE_YEAR_SECONDS,
    sameSite: 'lax',
    path: '/',
  });

  if (isPseudo) return;

  const user = await getSessionUser();
  // `isLocale` for the DB check constraint, which accepts the broader frozen
  // set — the earlier `isShippedLocale` guard is what keeps `ca` out today.
  if (user && isLocale(value)) {
    await updateProfileLocale(user.id, value);
  }
}
