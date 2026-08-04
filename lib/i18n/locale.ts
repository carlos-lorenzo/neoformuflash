import { cookies, headers } from 'next/headers';
import { DEFAULT_LOCALE, isLocale, resolveLocale, type Locale } from '@neoformuflash/contracts';

/**
 * The cookie is a per-request cache of the resolved locale, not the source of
 * truth. `profiles.locale` is authoritative and writes through to this cookie
 * whenever it changes (onboarding, the locale switcher).
 *
 * Why not read the profile here: this runs on every request including public,
 * anonymous ones, and `getUser()` is a network round trip to the auth server.
 * Paying that on a public note page — the SEO surface — to answer a question
 * the cookie already answers would be a poor trade.
 */
export const LOCALE_COOKIE = 'locale';

/**
 * A pseudo-locale used only by the 40%-padded overflow test (AC 10).
 * Guarded so it can never be selected in production.
 */
export const PSEUDO_LOCALE = 'pseudo';

function pseudoLocaleEnabled(): boolean {
  return process.env.NODE_ENV !== 'production' || process.env.E2E_TEST_AUTH === '1';
}

/**
 * Resolve the interface language for this request, entirely on the server.
 *
 * Precedence: cookie (written from the profile) → Accept-Language → default.
 *
 * Because this happens during render, the correct catalog is chosen before any
 * HTML exists. There is no client-side detection anywhere, so "no flash of the
 * wrong language" (AC 1c) holds by construction rather than by winning a race.
 */
export async function getActiveLocale(): Promise<Locale | typeof PSEUDO_LOCALE> {
  const cookieStore = await cookies();
  const cookieValue = cookieStore.get(LOCALE_COOKIE)?.value;

  if (cookieValue === PSEUDO_LOCALE && pseudoLocaleEnabled()) {
    return PSEUDO_LOCALE;
  }

  if (isLocale(cookieValue)) return cookieValue;

  const headerList = await headers();
  return resolveLocale(null, headerList.get('accept-language'));
}

export { DEFAULT_LOCALE, isLocale, resolveLocale };
export type { Locale };
