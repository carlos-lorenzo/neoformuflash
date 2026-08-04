/*
 * Theme constants, shared by server and client.
 *
 * Deliberately free of `next/headers`: the ThemeToggle is a client component
 * and needs THEME_CHOICES, so anything server-only here would pull the whole
 * request API into the browser bundle and fail the build. Server-side reads
 * live in lib/theme.server.ts.
 */

export const THEME_COOKIE = 'theme';

export const THEME_CHOICES = ['dark', 'light', 'system'] as const;
export type ThemeChoice = (typeof THEME_CHOICES)[number];

/** What actually gets stamped on <html>. 'system' is resolved away first. */
export type ResolvedTheme = 'dark' | 'light';

/** Dark is the product default — see design-system.md §0. */
export const DEFAULT_THEME: ThemeChoice = 'dark';

export function isThemeChoice(value: unknown): value is ThemeChoice {
  return typeof value === 'string' && (THEME_CHOICES as readonly string[]).includes(value);
}

/**
 * The inline script for the 'system' case only.
 *
 * It runs before first paint, reads the OS preference, and stamps the result.
 * For 'dark' and 'light' the server has already stamped the attribute and this
 * script is not rendered at all — the smallest amount of blocking JavaScript
 * that removes the flash, and none in the common case.
 *
 * Never solve this with useEffect: that runs after first paint by definition,
 * which IS the flash.
 */
export const SYSTEM_THEME_SCRIPT = `(function(){try{var d=window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';document.documentElement.dataset.theme=d}catch(e){}})()`;
