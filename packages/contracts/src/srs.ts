import {
  createEmptyCard,
  dateDiffInDays,
  default_learning_steps,
  default_relearning_steps,
  default_w,
  fsrs,
  generatorParameters,
  Rating as TsRating,
  State as TsState,
  type CardInput,
} from 'ts-fsrs';
import type { Database } from './db';

/*
 * Wraps ts-fsrs (ADR-001). No FSRS maths lives here or anywhere else in this
 * package — this file only translates between the DB's row shape (SrsState)
 * and ts-fsrs's own Card/CardInput shape, and calls the library.
 */

export type CardPhase = Database['public']['Enums']['card_phase'];
export type Rating = Database['public']['Enums']['review_rating'];

// Read from ts-fsrs at module load, never transcribed (ADR-001 item 4).
export const FSRS6_DEFAULT_WEIGHTS: readonly number[] = default_w;
export const MAX_INTERVAL_DAYS = 365;
export const LEARNING_STEPS = default_learning_steps;
export const RELEARNING_STEPS = default_relearning_steps;

export interface SchedulingSettings {
  /** Resolved value: deck override, else profile default. 0.70-0.98. */
  desiredRetention: number;
}

/** Shape of a `card_states` row, enough to reconstruct a ts-fsrs CardInput. */
export interface SrsState {
  stability: number;
  difficulty: number;
  phase: CardPhase;
  learningSteps: number;
  reps: number;
  lapses: number;
  dueAt: Date;
  lastReviewedAt: Date | null;
}

/** Everything `apply_review` needs beyond what's already in `next`. */
export interface ScheduleLog {
  phaseBefore: CardPhase;
  elapsedDays: number;
  scheduledDays: number;
  reviewStability: number;
  reviewDifficulty: number;
}

const PHASE_TO_STATE: Record<CardPhase, TsState> = {
  new: TsState.New,
  learning: TsState.Learning,
  review: TsState.Review,
  relearning: TsState.Relearning,
};

const RATING_TO_GRADE: Record<Rating, Exclude<TsRating, TsRating.Manual>> = {
  again: TsRating.Again,
  hard: TsRating.Hard,
  good: TsRating.Good,
  easy: TsRating.Easy,
};

function stateNumToPhase(state: TsState): CardPhase {
  return TsState[state].toLowerCase() as CardPhase;
}

/** New card: no `card_states` row exists yet (lazy union, decision 8). */
export function schedule(
  state: SrsState | null,
  rating: Rating,
  settings: SchedulingSettings,
  now: Date,
): { next: SrsState; log: ScheduleLog } {
  const params = generatorParameters({
    request_retention: settings.desiredRetention,
    maximum_interval: MAX_INTERVAL_DAYS,
    w: FSRS6_DEFAULT_WEIGHTS,
    enable_fuzz: true,
    enable_short_term: true,
    learning_steps: LEARNING_STEPS,
    relearning_steps: RELEARNING_STEPS,
  });
  const f = fsrs(params);

  const cardInput: CardInput =
    state === null
      ? createEmptyCard(now)
      : {
          due: state.dueAt,
          stability: state.stability,
          difficulty: state.difficulty,
          // Deprecated in ts-fsrs and unused by .next() (confirmed empirically:
          // varying it does not change the output). Required by CardInput regardless.
          elapsed_days: 0,
          scheduled_days: state.lastReviewedAt
            ? dateDiffInDays(state.lastReviewedAt, state.dueAt)
            : 0,
          learning_steps: state.learningSteps,
          reps: state.reps,
          lapses: state.lapses,
          state: PHASE_TO_STATE[state.phase],
          last_review: state.lastReviewedAt ?? undefined,
        };

  const { card, log } = f.next(cardInput, now, RATING_TO_GRADE[rating]);

  const next: SrsState = {
    stability: card.stability,
    difficulty: card.difficulty,
    phase: stateNumToPhase(card.state),
    learningSteps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    dueAt: card.due,
    lastReviewedAt: card.last_review ?? now,
  };

  return {
    next,
    log: {
      phaseBefore: state?.phase ?? 'new',
      elapsedDays: state?.lastReviewedAt ? dateDiffInDays(state.lastReviewedAt, now) : 0,
      scheduledDays: log.scheduled_days,
      reviewStability: log.stability,
      reviewDifficulty: log.difficulty,
    },
  };
}
