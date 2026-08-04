import { z } from 'zod';
import { LOCALES } from './i18n';

/*
 * Zod schemas for every input crossing a trust boundary.
 * Phase 00 defines only what signup needs; the rest lands in phase 01.
 *
 * Error messages are STABLE CODES, not prose. The UI looks each code up in the
 * message catalog and renders it in the user's language. Putting English prose
 * here would mean a Spanish student sees an English validation error — and
 * `lint:i18n` cannot catch it, because this file is outside app/ and components/.
 */

export const DISPLAY_NAME_MAX = 80;
export const INSTITUTION_OTHER_MAX = 120;

export const SignupProfileInput = z
  .object({
    displayName: z
      .string()
      .trim()
      .min(1, 'onboarding.displayName.required')
      .max(DISPLAY_NAME_MAX, 'onboarding.displayName.tooLong'),

    /** A row in `institutions`. Null when the student picked "other". */
    institutionId: z.uuid('onboarding.institution.invalid').nullable(),

    /**
     * Free text from the "my university isn't listed" path. This NEVER creates
     * an `institutions` row — it is written to `institution_requests` for
     * moderation. A text column here would mean 400 spellings of "Universitat
     * Politècnica de València" by the time V2's browse-by-university matters.
     */
    institutionOther: z
      .string()
      .trim()
      .min(1, 'onboarding.institution.required')
      .max(INSTITUTION_OTHER_MAX, 'onboarding.institution.tooLong')
      .nullable(),

    /** A row in `degrees`, always belonging to `institutionId`. */
    degreeId: z.uuid('onboarding.degree.invalid').nullable(),

    locale: z.enum(LOCALES),
  })
  .refine((v) => v.institutionId === null || v.institutionOther === null, {
    error: 'onboarding.institution.ambiguous',
    path: ['institutionOther'],
  })
  .refine((v) => v.institutionId !== null || v.institutionOther !== null, {
    error: 'onboarding.institution.required',
    path: ['institutionId'],
  })
  // A degree belongs to an institution, so it cannot be set on the "other" path.
  .refine((v) => v.degreeId === null || v.institutionId !== null, {
    error: 'onboarding.degree.needsInstitution',
    path: ['degreeId'],
  });

export type SignupProfileInput = z.infer<typeof SignupProfileInput>;
