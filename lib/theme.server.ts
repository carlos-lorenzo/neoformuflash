import 'server-only';
import { cookies } from 'next/headers';
import { DEFAULT_THEME, THEME_COOKIE, isThemeChoice, type ThemeChoice } from './theme';

/*
 * Read the theme during server render, so an explicit dark/light choice paints
 * correctly with no JavaScript at all (AC 5).
 *
 * `server-only` makes an accidental client import a build error with a clear
 * message, rather than a confusing "next/headers is not available" trace.
 */
export async function getThemeChoice(): Promise<ThemeChoice> {
  const cookieStore = await cookies();
  const value = cookieStore.get(THEME_COOKIE)?.value;
  return isThemeChoice(value) ? value : DEFAULT_THEME;
}
