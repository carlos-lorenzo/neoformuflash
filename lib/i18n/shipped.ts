import type { Locale } from '@neoformuflash/contracts';

/*
 * Locales that have a message catalog on disk and can actually be rendered.
 *
 * The distinction from `LOCALES` (in the frozen contracts package) matters:
 *   - `LOCALES` is the *type* of locale a profile row may hold, and the values
 *     the DB `check (locale in (...))` accepts. Frozen — it takes a migration
 *     and a spec change to move.
 *   - `SHIPPED_LOCALES` is what the app can currently serve without crashing.
 *     Free to change — a catalog lands in `messages/<locale>.json`, this list
 *     grows by one entry.
 *
 * Catalan (`ca`) is in `LOCALES` because it is a supported profile value and a
 * planned language, per specs/phase-00-foundation.md. It is *not* in this list
 * because `messages/ca.json` does not exist yet: advertising it caused the
 * next-intl request config to throw on every render, locking users out with no
 * in-app way back — the picker, the `Accept-Language` resolver and the
 * write-side action all route through here so that path is closed at every
 * entry, not just at the picker.
 *
 * `lib/i18n/shipped.test.ts` fails if this list diverges from the actual
 * `messages/*.json` files, so re-adding `ca` is one entry in this array and
 * one file on disk — not one comment nobody read.
 */
export const SHIPPED_LOCALES = ['en', 'es'] as const;

export type ShippedLocale = (typeof SHIPPED_LOCALES)[number];

export function isShippedLocale(value: unknown): value is ShippedLocale {
  return typeof value === 'string' && (SHIPPED_LOCALES as readonly string[]).includes(value);
}

/*
 * A compile-time assertion that `SHIPPED_LOCALES` cannot drift outside the
 * frozen `LOCALES` type. If a future edit here adds a locale that is not a
 * valid profile value, this line stops compiling — and a runtime cast in the
 * DB write path would have been the alternative failure mode.
 */
const _shippedIsSubsetOfLocales: readonly Locale[] = SHIPPED_LOCALES;
void _shippedIsSubsetOfLocales;
