/*
 * packages/contracts is the single source of truth. Nothing else in the repo
 * defines these types. Changing this package is a schema change: it needs a
 * migration, a spec update, and Carlos's approval. Never edit it to make a
 * test pass.
 *
 * Phase 00 ships only the slice signup needs. `src/srs.ts`, `src/sharing.ts`,
 * `src/content.ts` and the remaining schemas land in phase 01.
 */

export { LOCALES, DEFAULT_LOCALE, isLocale, resolveLocale } from './i18n';
export type { Locale } from './i18n';

export { SignupProfileInput, DISPLAY_NAME_MAX, INSTITUTION_OTHER_MAX } from './schemas';
