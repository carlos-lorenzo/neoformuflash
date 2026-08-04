'use server';

import { cookies } from 'next/headers';
import { isLocale } from '@neoformuflash/contracts';
import { LOCALE_COOKIE, PSEUDO_LOCALE } from '@/lib/i18n/locale';
import { THEME_COOKIE, isThemeChoice } from '@/lib/theme';
import { SIDEBAR_COOKIE } from '@/lib/preferences';
import { updateProfileLocale } from '@/lib/db/profiles';
import { getSessionUser } from '@/lib/supabase/session';

/*
 * Theme and locale are preferences, not data, so they live in cookies and are
 * read during render. Both actions also persist to the profile when there is a
 * session, so the choice follows the student to a different browser.
 */

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export async function setSidebarCollapsed(collapsed: boolean): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SIDEBAR_COOKIE, collapsed ? '1' : '0', {
    maxAge: ONE_YEAR_SECONDS,
    sameSite: 'lax',
    path: '/',
  });
}

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
  if (!isLocale(value) && !isPseudo) return;

  const cookieStore = await cookies();
  cookieStore.set(LOCALE_COOKIE, value, {
    maxAge: ONE_YEAR_SECONDS,
    sameSite: 'lax',
    path: '/',
  });

  if (isPseudo) return;

  const user = await getSessionUser();
  if (user && isLocale(value)) {
    await updateProfileLocale(user.id, value);
  }
}
