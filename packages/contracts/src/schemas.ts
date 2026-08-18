import { z } from 'zod';
import { LOCALES } from './i18n';
import type { NoteDoc } from './content';
import type { Database } from './db';

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

/*
 * Phase 01: content, sharing, review and BYOK inputs. Frozen alongside the
 * migrations in supabase/migrations/0003-0007. A schema change here needs a
 * migration, a spec update, and Carlos's approval.
 */

const Visibility = z.enum(['public', 'unlisted', 'private']);
// Content language (decision 7) — deliberately independent of interface LOCALES.
const ContentLanguage = z
  .string()
  .toLowerCase()
  .regex(/^[a-z]{2}$/, 'content.language.invalid');

export const TITLE_MAX = 200;

export const CreateNoteInput = z.object({
  courseId: z.uuid('content.course.invalid').nullable(),
  title: z
    .string()
    .trim()
    .min(1, 'content.title.required')
    .max(TITLE_MAX, 'content.title.tooLong'),
  contentJson: z.custom<NoteDoc>(),
  contentText: z.string(),
  language: ContentLanguage,
  visibility: Visibility,
});
export type CreateNoteInput = z.infer<typeof CreateNoteInput>;

export const UpdateNoteInput = z.object({
  id: z.uuid('content.note.invalid'),
  courseId: z.uuid('content.course.invalid').nullable().optional(),
  title: z
    .string()
    .trim()
    .min(1, 'content.title.required')
    .max(TITLE_MAX, 'content.title.tooLong')
    .optional(),
  contentJson: z.custom<NoteDoc>().optional(),
  contentText: z.string().optional(),
  language: ContentLanguage.optional(),
  visibility: Visibility.optional(),
});
export type UpdateNoteInput = z.infer<typeof UpdateNoteInput>;

export const COURSE_CODE_MAX = 32;

export const CreateCourseInput = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'content.course.nameRequired')
    .max(TITLE_MAX, 'content.course.nameTooLong'),
  code: z.string().trim().max(COURSE_CODE_MAX, 'content.course.codeTooLong').nullable().optional(),
  language: ContentLanguage,
  visibility: Visibility,
  institutionId: z.uuid('content.course.institutionInvalid').nullable().optional(),
  degreeId: z.uuid('content.course.degreeInvalid').nullable().optional(),
});
export type CreateCourseInput = z.infer<typeof CreateCourseInput>;

export const UpdateCourseInput = z.object({
  id: z.uuid('content.course.invalid'),
  name: z
    .string()
    .trim()
    .min(1, 'content.course.nameRequired')
    .max(TITLE_MAX, 'content.course.nameTooLong')
    .optional(),
  code: z.string().trim().max(COURSE_CODE_MAX, 'content.course.codeTooLong').nullable().optional(),
  language: ContentLanguage.optional(),
  visibility: Visibility.optional(),
  institutionId: z.uuid('content.course.institutionInvalid').nullable().optional(),
  degreeId: z.uuid('content.course.degreeInvalid').nullable().optional(),
});
export type UpdateCourseInput = z.infer<typeof UpdateCourseInput>;

export const CreateDeckInput = z.object({
  courseId: z.uuid('content.course.invalid').nullable(),
  noteId: z.uuid('content.note.invalid').nullable(),
  title: z
    .string()
    .trim()
    .min(1, 'content.title.required')
    .max(TITLE_MAX, 'content.title.tooLong'),
  visibility: Visibility,
  // null = inherit from profile (matches the nullable column).
  desiredRetention: z
    .number()
    .min(0.7, 'content.deck.retentionOutOfRange')
    .max(0.98, 'content.deck.retentionOutOfRange')
    .nullable(),
  newCardsPerDay: z.int().min(0, 'content.deck.newCardsPerDayNegative'),
});
export type CreateDeckInput = z.infer<typeof CreateDeckInput>;

/*
 * Author-set difficulty hint, on the same 4-point scale as a review rating
 * (migration 0010). Typed against the DB enum rather than a bare z.enum, so
 * changing `review_rating` in a migration breaks this build instead of
 * silently drifting — the same discipline as AiProvider below.
 *
 * NULL = unset. The card editor defaults new cards to 'good'. The enum's
 * declaration order (again < hard < good < easy) is the card-list sort key.
 */
const Confidence: z.ZodType<Database['public']['Enums']['review_rating']> = z.enum([
  'again',
  'hard',
  'good',
  'easy',
]);

export const CardInput = z.object({
  deckId: z.uuid('content.deck.invalid'),
  frontJson: z.custom<NoteDoc>(),
  backJson: z.custom<NoteDoc>(),
  frontText: z.string(),
  backText: z.string(),
  position: z.int(),
  confidence: Confidence.nullable(),
});
export type CardInput = z.infer<typeof CardInput>;

/*
 * The card-update action's input. Separate from CardInput rather than
 * `CardInput.partial()`: an update targets an existing row by id, and deckId
 * is required (not optional) because the action authorises against the deck's
 * owner before it touches the card. Every content field is optional so the
 * inline-edit path during review can send front/back alone, and the card
 * editor can send confidence alone.
 *
 * `position` is updatable but `contentVersion` is not — that column is bumped
 * by the 0003 trigger only when front_text/back_text actually change
 * (ADR-002 decision 8), never by the client.
 */
export const UpdateCardInput = z.object({
  id: z.uuid('content.card.invalid'),
  deckId: z.uuid('content.deck.invalid'),
  frontJson: z.custom<NoteDoc>().optional(),
  backJson: z.custom<NoteDoc>().optional(),
  frontText: z.string().optional(),
  backText: z.string().optional(),
  position: z.int().optional(),
  confidence: Confidence.nullable().optional(),
});
export type UpdateCardInput = z.infer<typeof UpdateCardInput>;

export const ReviewSubmission = z.object({
  cardId: z.uuid('srs.card.invalid'),
  rating: z.enum(['again', 'hard', 'good', 'easy']),
  elapsedMs: z.int().min(0, 'srs.elapsedMs.negative').nullable(),
  editedDuringReview: z.boolean(),
});
export type ReviewSubmission = z.infer<typeof ReviewSubmission>;

const AiProvider: z.ZodType<Database['public']['Enums']['ai_provider']> = z.enum([
  'openai',
  'google',
  'anthropic',
]);

export const ApiKeyInput = z.object({
  provider: AiProvider,
  // Raw key from the user. Encrypted server-side before it ever reaches
  // user_api_keys — this schema never sees ciphertext.
  apiKey: z.string().trim().min(1, 'ai.apiKey.required'),
});
export type ApiKeyInput = z.infer<typeof ApiKeyInput>;

/**
 * SEO metadata for a note. All fields optional — owner can update any subset.
 * ogImageUrl must be a valid HTTPS URL when provided.
 */
export const UpdateNoteSeoInput = z.object({
  noteId: z.uuid('content.note.invalid'),
  ogTitle: z
    .string()
    .trim()
    .max(120, 'content.seo.ogTitleTooLong')
    .nullable()
    .optional(),
  ogDescription: z
    .string()
    .trim()
    .max(255, 'content.seo.ogDescriptionTooLong')
    .nullable()
    .optional(),
  ogImageUrl: z
    .string()
    .trim()
    .url('content.seo.ogImageUrlInvalid')
    .max(2048, 'content.seo.ogImageUrlTooLong')
    .nullable()
    .optional()
    .refine((v) => v === null || v === undefined || v.startsWith('https://'), {
      error: 'content.seo.ogImageUrlMustBeHttps',
    }),
});
export type UpdateNoteSeoInput = z.infer<typeof UpdateNoteSeoInput>;
