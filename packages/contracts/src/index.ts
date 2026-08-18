/*
 * packages/contracts is the single source of truth. Nothing else in the repo
 * defines these types. Changing this package is a schema change: it needs a
 * migration, a spec update, and Carlos's approval. Never edit it to make a
 * test pass.
 */

export { LOCALES, DEFAULT_LOCALE, isLocale, resolveLocale } from './i18n';
export type { Locale } from './i18n';

export {
  SignupProfileInput,
  DISPLAY_NAME_MAX,
  INSTITUTION_OTHER_MAX,
  TITLE_MAX,
  CreateNoteInput,
  UpdateNoteInput,
  CreateCourseInput,
  UpdateCourseInput,
  CreateDeckInput,
  CardInput,
  UpdateCardInput,
  ReviewSubmission,
  ApiKeyInput,
  UpdateNoteSeoInput,
} from './schemas';

export {
  schedule,
  FSRS6_DEFAULT_WEIGHTS,
  MAX_INTERVAL_DAYS,
  LEARNING_STEPS,
  RELEARNING_STEPS,
} from './srs';
export type { SrsState, SchedulingSettings, ScheduleLog, CardPhase, Rating } from './srs';

export { extractText } from './content';
export type {
  NoteDoc,
  BlockNode,
  InlineNode,
  TextNode,
  InlineMathNode,
  DisplayMathNode,
  ParagraphNode,
  HeadingNode,
  CodeBlockNode,
  BulletListNode,
  OrderedListNode,
  ListItemNode,
  BlockquoteNode,
  TextMarks,
} from './content';

export { SubscribeInput, ForkInput } from './sharing';
export type { CourseLineage, ForkResult } from './sharing';

export type { PublicProfile, PublicCourse, PublicDeck, PublicNote, UpdateNoteSeoInput as UpdateNoteSeoInputType } from './public';
