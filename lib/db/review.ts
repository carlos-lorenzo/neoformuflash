/**
 * Review session data access.
 *
 * This is the heart of phase 03: startReview, gradeCard (authoritative),
 * undoGrade, acknowledgeChange, and saveInlineEdit.
 *
 * AC6 (the load-bearing correctness proof) is satisfied here: gradeCard
 * reloads card_states at grade time, calls schedule() from
 * @neoformuflash/contracts, then the apply_review RPC. No FSRS maths
 * lives in this file — only the exact param mapping from the spec table.
 *
 * "gradeCard is authoritative: reloads the current card_states row at grade
 * time (never trusts the client's copy), calls schedule(state, rating,
 * settings, now), then the apply_review RPC. Previews returned at
 * startReview are best-effort display only." — phase-03 spec
 */

import type { NoteDoc, SrsState, ScheduleLog, Rating, SchedulingSettings } from '@neoformuflash/contracts';
import { schedule } from '@neoformuflash/contracts';
import type { ReviewSubmission } from '@neoformuflash/contracts';
import type { Database } from '@neoformuflash/contracts/db';
import { err, ok, type Result } from '@/lib/result';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { formatInterval } from '@/lib/review/format-interval';
import { getStreak } from './decks';
import type { Streak } from './decks';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type ReviewQueueCard = {
  card: { id: string; frontJson: NoteDoc; backJson: NoteDoc; contentVersion: number };
  state: SrsState | null;
  changed: boolean;
  previews: Record<Rating, string>;
};

export type ReviewQueueItem = ReviewQueueCard;

export type StartReviewResult = {
  deck: { id: string; title: string; desiredRetention: number };
  cards: ReviewQueueCard[];
  streak: Streak | null;
};

export type GradeCardResult = {
  next: SrsState;
  log: ScheduleLog;
};

type DbCardPhase = Database['public']['Enums']['card_phase'];

const SESSION_CAP = 100;

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Resolve the per-deck desired retention: deck override → profile default. */
async function resolveRetention(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  deckRetention: number | null,
  userId: string,
): Promise<number> {
  if (deckRetention !== null) return deckRetention;

  const { data } = await supabase
    .from('profiles')
    .select('desired_retention')
    .eq('id', userId)
    .single();

  return data?.desired_retention ?? 0.9;
}

/** Convert a card_states row to SrsState. */
function rowToSrs(row: {
  stability: number;
  difficulty: number;
  phase: DbCardPhase;
  learning_steps: number;
  reps: number;
  lapses: number;
  due_at: string;
  last_reviewed_at: string | null;
}): SrsState {
  return {
    stability: row.stability,
    difficulty: row.difficulty,
    phase: row.phase as SrsState['phase'],
    learningSteps: row.learning_steps,
    reps: row.reps,
    lapses: row.lapses,
    dueAt: new Date(row.due_at),
    lastReviewedAt: row.last_reviewed_at ? new Date(row.last_reviewed_at) : null,
  };
}

/* ------------------------------------------------------------------ */
/*  startReview                                                        */
/* ------------------------------------------------------------------ */

/**
 * Build the review queue for a deck.
 *
 * Queue = lazy union (phase-01 spec):
 *   1. Due states (due_at <= now(), ordered by due_at)
 *   2. New cards (no card_states row, ordered by position), capped at
 *      new_cards_per_day − count(today's new-phase reviews)
 *
 * Session cap: 100 cards total. Due cards are prioritised.
 *
 * Each card entry includes interval previews for the four ratings.
 * These are best-effort display only — gradeCard recomputes authoritatively.
 *
 * Learning-step re-show is a documented deviation: the focused session
 * re-shows a learning/relearning card after a short fixed pause rather
 * than waiting 1-10 min. Between-session spacing still follows FSRS
 * exactly. Flag this in the code comment; revisit when sessions get longer.
 */
export async function startReview(
  userId: string,
  deckId: string,
): Promise<Result<StartReviewResult>> {
  const supabase = await createSupabaseServerClient();
  const now = new Date();

  // 1. Load deck (RLS enforces visibility)
  const { data: deck, error: deckErr } = await supabase
    .from('decks')
    .select('id, title, desired_retention, new_cards_per_day')
    .eq('id', deckId)
    .maybeSingle();

  if (deckErr) return err('error.unexpected', deckErr);
  if (!deck) return err('deck.notFound');

  const desiredRetention = await resolveRetention(supabase, deck.desired_retention, userId);
  const settings: SchedulingSettings = { desiredRetention };

  // 2. Due states (first branch of the lazy union)
  const { data: dueRows } = await supabase
    .from('card_states')
    .select('card_id, stability, difficulty, phase, learning_steps, reps, lapses, due_at, last_reviewed_at, seen_version')
    .eq('user_id', userId)
    .eq('deck_id', deckId)
    .lte('due_at', now.toISOString())
    .order('due_at', { ascending: true })
    .limit(SESSION_CAP);

  const dueEntries = dueRows ?? [];
  const remainingSlots = SESSION_CAP - dueEntries.length;

  // 3. New cards (second branch), capped by daily allowance
  let newCards: typeof dueEntries = [];
  if (remainingSlots > 0) {
    // Count today's reviews that started as 'new' (to compute the daily cap)
    const todayStart = new Date(now);
    todayStart.setUTCHours(0, 0, 0, 0);

    const { count: newReviewsToday } = await supabase
      .from('review_logs')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('phase', 'new')
      .gte('reviewed_at', todayStart.toISOString());

    const dailyCap = deck.new_cards_per_day - (newReviewsToday ?? 0);
    const newCardSlots = Math.max(0, Math.min(remainingSlots, dailyCap));

    if (newCardSlots > 0) {
      // New cards = cards in this deck with no card_states row for this user.
      // We get all cards in the deck, then filter out those with states in TS.
      const { data: allStates } = await supabase
        .from('card_states')
        .select('card_id')
        .eq('user_id', userId)
        .eq('deck_id', deckId);

      const stateCardIds = new Set((allStates ?? []).map((r) => r.card_id));

      const { data: allCards } = await supabase
        .from('cards')
        .select('id, front_json, back_json, content_version')
        .eq('deck_id', deckId)
        .order('position', { ascending: true });

      // Cards without a state row, in position order, capped
      const newCardsRaw = (allCards ?? []).filter((c) => !stateCardIds.has(c.id));
      newCards = newCardsRaw.slice(0, newCardSlots).map((c) => ({
        card_id: c.id,
        stability: 0,
        difficulty: 5.0,
        phase: 'new' as DbCardPhase,
        learning_steps: 0,
        reps: 0,
        lapses: 0,
        due_at: now.toISOString(),
        last_reviewed_at: null,
        seen_version: 1,
      }));
    }
  }

  // 4. Merge: due first, then new. Load card content for both.
  const mergedIds = [...dueEntries.map((r) => r.card_id), ...newCards.map((r) => r.card_id)];
  if (mergedIds.length === 0) {
    const streak = await getStreak(userId);
    return ok({ deck: { id: deck.id, title: deck.title, desiredRetention }, cards: [], streak: streak.ok ? streak.value : null });
  }

  // Fetch card content in one query
  const { data: cardsContent } = await supabase
    .from('cards')
    .select('id, front_json, back_json, content_version')
    .in('id', mergedIds);

  const contentMap = new Map((cardsContent ?? []).map((c) => [c.id, c]));

  // Build the queue entries
  const allStateRows = [...dueEntries, ...newCards];

  const cards: ReviewQueueCard[] = allStateRows.map((row) => {
    const content = contentMap.get(row.card_id);
    if (!content) return null; // shouldn't happen — RLS + FK guarantee existence

    const state = row.phase === 'new' && row.reps === 0 && row.stability === 0
      ? null
      : rowToSrs(row);

    const changed = content.content_version > (row.seen_version ?? 1);

    // Compute previews for the four ratings
    const previews: Record<Rating, string> = {
      again: '',
      hard: '',
      good: '',
      easy: '',
    };
    for (const rating of ['again', 'hard', 'good', 'easy'] as Rating[]) {
      const { next } = schedule(state, rating, settings, now);
      const days = (next.dueAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
      previews[rating] = formatInterval(days);
    }

    return {
      card: {
        id: content.id,
        frontJson: content.front_json as unknown as NoteDoc,
        backJson: content.back_json as unknown as NoteDoc,
        contentVersion: content.content_version,
      },
      state,
      changed,
      previews,
    };
  }).filter(Boolean) as ReviewQueueCard[];

  const streak = await getStreak(userId);
  return ok({
    deck: { id: deck.id, title: deck.title, desiredRetention },
    cards,
    streak: streak.ok ? streak.value : null,
  });
}

/* ------------------------------------------------------------------ */
/*  gradeCard (authoritative)                                          */
/* ------------------------------------------------------------------ */

/**
 * Authoritative card grading. Reloads the current card_states row at grade
 * time, calls schedule(), then the apply_review RPC. Never trusts the
 * client's copy of the state.
 *
 * The exact RPC param mapping is from the phase-03 spec table.
 */
export async function gradeCard(
  userId: string,
  submission: ReviewSubmission,
): Promise<Result<GradeCardResult>> {
  const supabase = await createSupabaseServerClient();
  const now = new Date();

  // 1. Reload the current card_states row (or null for a new card)
  const { data: stateRow } = await supabase
    .from('card_states')
    .select('stability, difficulty, phase, learning_steps, reps, lapses, due_at, last_reviewed_at')
    .eq('user_id', userId)
    .eq('card_id', submission.cardId)
    .maybeSingle();

  // 2. Load the card's deck to resolve desired_retention
  const { data: card } = await supabase
    .from('cards')
    .select('deck_id')
    .eq('id', submission.cardId)
    .single();

  if (!card) return err('card.notFound');

  const { data: deck } = await supabase
    .from('decks')
    .select('desired_retention')
    .eq('id', card.deck_id)
    .single();

  const desiredRetention = await resolveRetention(supabase, deck?.desired_retention ?? null, userId);
  const settings: SchedulingSettings = { desiredRetention };

  // 3. Compute next state via schedule() — this is the only FSRS call
  const state = stateRow ? rowToSrs(stateRow) : null;
  const { next, log } = schedule(state, submission.rating, settings, now);

  // 4. Call apply_review RPC with the exact param mapping
  const { error: rpcErr } = await supabase.rpc('apply_review', {
    p_card_id: submission.cardId,
    p_rating: submission.rating,
    p_elapsed_ms: submission.elapsedMs ?? 0,
    p_edited_during_review: submission.editedDuringReview,
    p_phase_before: log.phaseBefore,
    p_elapsed_days: log.elapsedDays,
    p_scheduled_days: log.scheduledDays,
    p_review_stability: log.reviewStability,
    p_review_difficulty: log.reviewDifficulty,
    p_stability: next.stability,
    p_difficulty: next.difficulty,
    p_phase: next.phase,
    p_due_at: next.dueAt.toISOString(),
    p_learning_steps: next.learningSteps,
    p_lapses: next.lapses,
  });

  if (rpcErr) return err('error.unexpected', rpcErr);

  return ok({ next, log });
}

/* ------------------------------------------------------------------ */
/*  undoGrade                                                          */
/* ------------------------------------------------------------------ */

/**
 * Undo the most recent grade. Sends the client's pre-review SrsState
 * to the undo_review RPC. The migration restores stability/difficulty/phase
 * from the deleted review_logs row (ignoring the client's copy for those),
 * and uses p_prev only for learning_steps, reps, lapses, due_at,
 * last_reviewed_at.
 *
 * Streak is NOT decremented (cosmetic, rare path — no DELETE trigger on
 * streaks, per the spec's Risks).
 */
export async function undoGrade(
  _userId: string,
  input: { cardId: string; prevState: SrsState },
): Promise<Result<void>> {
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase.rpc('undo_review', {
    p_card_id: input.cardId,
    p_prev: {
      stability: input.prevState.stability,
      difficulty: input.prevState.difficulty,
      phase: input.prevState.phase,
      learningSteps: input.prevState.learningSteps,
      reps: input.prevState.reps,
      lapses: input.prevState.lapses,
      dueAt: input.prevState.dueAt.toISOString(),
      lastReviewedAt: input.prevState.lastReviewedAt?.toISOString() ?? null,
    },
  });

  if (error) return err('error.unexpected', error);
  return ok(undefined);
}

/* ------------------------------------------------------------------ */
/*  acknowledgeChange                                                  */
/* ------------------------------------------------------------------ */

/**
 * Acknowledge (dismiss) or reset a content-change flag.
 *
 * reset=false: sets seen_version = current content_version (dismiss).
 * reset=true:  same + returns FSRS state to new (reset), preserving lapses.
 */
export async function acknowledgeChange(
  _userId: string,
  input: { cardId: string; reset: boolean },
): Promise<Result<void>> {
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase.rpc('acknowledge_card_change', {
    p_card_id: input.cardId,
    p_reset: input.reset,
  });

  if (error) return err('error.unexpected', error);
  return ok(undefined);
}

/* ------------------------------------------------------------------ */
/*  saveInlineEdit                                                     */
/* ------------------------------------------------------------------ */

/**
 * Save an inline edit during review. Updates the card's content (which
 * bumps content_version if text changed, via the 0003 trigger), then
 * acknowledges the change for the editing user (so they don't see their
 * own flag).
 *
 * The `edited_during_review` flag is set at grade time, not here — the
 * client tracks the flag and sends it in the ReviewSubmission when the
 * student grades the card.
 */
export async function saveInlineEdit(
  _userId: string,
  input: {
    cardId: string;
    frontJson: NoteDoc;
    backJson: NoteDoc;
    frontText: string;
    backText: string;
    confidence?: Database['public']['Enums']['review_rating'] | null;
  },
): Promise<Result<{ contentVersion: number }>> {
  const supabase = await createSupabaseServerClient();

  // 1. Load the card to get its deck_id (for the update query)
  const { data: card, error: cardErr } = await supabase
    .from('cards')
    .select('id, deck_id')
    .eq('id', input.cardId)
    .single();

  if (cardErr || !card) return err('card.notFound');

  // 2. Update the card content — RLS cards_update_own enforces ownership
  const update: Record<string, unknown> = {
    front_json: input.frontJson,
    back_json: input.backJson,
    front_text: input.frontText,
    back_text: input.backText,
  };
  if (input.confidence !== undefined) update.confidence = input.confidence;

  const { data: updated, error: updateErr } = await supabase
    .from('cards')
    .update(update as Database['public']['Tables']['cards']['Update'])
    .eq('id', input.cardId)
    .eq('deck_id', card.deck_id)
    .select('content_version')
    .single();

  if (updateErr) return err('error.unexpected', updateErr);

  // 3. Acknowledge the change for the editing user (dismiss the flag)
  const { error: ackErr } = await supabase.rpc('acknowledge_card_change', {
    p_card_id: input.cardId,
    p_reset: false,
  });

  if (ackErr) return err('error.unexpected', ackErr);

  return ok({ contentVersion: updated.content_version });
}
