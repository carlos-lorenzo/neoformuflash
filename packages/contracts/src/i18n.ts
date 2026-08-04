/*
 * Interface language. NOT content language.
 *
 * Per decision 7 in specs/01-contracts.md these are different things and are
 * deliberately unrelated: `profiles.locale` is which language the product
 * speaks to you in; `notes.language` / `courses.language` is what language the
 * content is written in. A student with an English interface writes notes in
 * Spanish constantly.
 *
 * Only the types are frozen here. Message catalogs live in `messages/<locale>.json`
 * outside this package.
 */

export const LOCALES = ['en', 'es', 'ca'] as const;

export type Locale = (typeof LOCALES)[number];

/**
 * The fallback when we know nothing about the visitor — no profile, no cookie,
 * no usable Accept-Language. English, not Spanish: it is the widest-understood
 * option for an unknown visitor, and a Spanish browser still gets Spanish via
 * Accept-Language, which is the far more common path in practice.
 *
 * This is the INTERFACE language only. Content language (`notes.language`)
 * defaults separately — see decision 7 in specs/01-contracts.md.
 */
export const DEFAULT_LOCALE: Locale = 'en';

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

/**
 * Parse an `Accept-Language` header into locales ordered by descending q-value.
 * Malformed entries are skipped rather than throwing — this input comes from
 * the network and a bad header must never be able to break a page render.
 */
function parseAcceptLanguage(header: string): string[] {
  return header
    .split(',')
    .map((part) => {
      const [tag, ...params] = part.trim().split(';');
      if (!tag) return null;

      const qParam = params.find((p) => p.trim().startsWith('q='));
      const q = qParam ? Number.parseFloat(qParam.trim().slice(2)) : 1;

      return { tag: tag.trim().toLowerCase(), q: Number.isFinite(q) ? q : 0 };
    })
    .filter((entry): entry is { tag: string; q: number } => entry !== null && entry.q > 0)
    .sort((a, b) => b.q - a.q)
    .map((entry) => entry.tag);
}

/**
 * Resolve which language the interface speaks, in strict precedence order:
 *
 *   1. the signed-in user's stored `profiles.locale`
 *   2. the browser's `Accept-Language`, matched on the primary subtag
 *   3. DEFAULT_LOCALE
 *
 * A stored profile locale always wins over the header — a user who chose
 * English on a Spanish-configured laptop meant it, and re-detecting on every
 * request would silently undo their choice.
 *
 * This runs on the server during render, which is why there is no flash of the
 * wrong language: the correct catalog is chosen before any HTML is produced.
 */
export function resolveLocale(
  profileLocale: string | null | undefined,
  acceptLanguage: string | null | undefined
): Locale {
  if (isLocale(profileLocale)) return profileLocale;

  if (acceptLanguage) {
    for (const tag of parseAcceptLanguage(acceptLanguage)) {
      // `es-ES` and `es-419` both resolve to `es`.
      const primary = tag.split('-')[0];
      if (isLocale(primary)) return primary;
    }
  }

  return DEFAULT_LOCALE;
}
