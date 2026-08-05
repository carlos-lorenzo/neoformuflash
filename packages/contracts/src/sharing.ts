import { z } from 'zod';

/*
 * Inputs and results for subscribe_to_course/subscribe_to_deck/fork_course/
 * fork_deck (0005_sharing.sql). The procedures do the real validation
 * (private/own-target rejection); these schemas only guard the shape of what
 * reaches the RPC call.
 */

export const SubscribeInput = z.object({
  targetId: z.uuid('sharing.target.invalid'),
  targetType: z.enum(['course', 'deck']),
});
export type SubscribeInput = z.infer<typeof SubscribeInput>;

export const ForkInput = z.object({
  targetId: z.uuid('sharing.target.invalid'),
  targetType: z.enum(['course', 'deck']),
});
export type ForkInput = z.infer<typeof ForkInput>;

/** `courses.source_course_id` / `decks.source_deck_id` chain, one hop. */
export interface CourseLineage {
  sourceCourseId: string | null;
  sourceDeckId: string | null;
}

/** Mirrors the `fork_result` composite type returned by fork_course/fork_deck. */
export interface ForkResult {
  courseId: string | null;
  deckId: string | null;
  /** Rows in card_states re-pointed to the fork — what FSRS progress survived. */
  statesCarried: number;
}
