'use server';

/**
 * Server actions for review session.
 *
 * Pattern: re-check auth, validate, delegate to lib/db/review.
 */

import { getSessionUser } from '@/lib/supabase/session';
import { startReview, gradeCard, undoGrade, saveInlineEdit as saveInlineEditDb, acknowledgeChange } from '@/lib/db/review';
import { getStreak } from '@/lib/db/decks';
import type { ReviewQueueCard } from '@/lib/db/review';
import type { SrsState, NoteDoc } from '@neoformuflash/contracts';

/* ------------------------------------------------------------------ */
/*  Start review session                                               */
/* ------------------------------------------------------------------ */

export async function getReviewQueue(deckId: string): Promise<
  | { ok: true; value: { queue: ReviewQueueCard[]; streak: { current: number; longest: number; lastActiveDate: string | null } | null } }
  | { ok: false; code: string }
> {
  const user = await getSessionUser();
  if (!user) return { ok: false, code: 'error.unexpected' };

  const res = await startReview(user.id, deckId);
  if (!res.ok) return { ok: false, code: res.code };

  return {
    ok: true,
    value: {
      queue: res.value.cards,
      streak: res.value.streak
    }
  };
}

/* ------------------------------------------------------------------ */
/*  Submit review                                                      */
/* ------------------------------------------------------------------ */

export async function submitReview(input: {
  deckId: string;
  cardId: string;
  rating: 'again' | 'hard' | 'good' | 'easy';
  responseTimeMs: number;
}): Promise<{
  ok: boolean;
  value?: { learning: boolean; queue: unknown[]; reviewedCount: number; streak: { current: number; longest: number; lastActiveDate: string | null } };
  errors?: Record<string, string>;
}> {
  const user = await getSessionUser();
  if (!user) return { ok: false, errors: { form: 'error.unexpected' } };

  const res = await gradeCard(user.id, {
    cardId: input.cardId,
    rating: input.rating,
    elapsedMs: input.responseTimeMs,
    editedDuringReview: false,
  });
  if (!res.ok) return { ok: false, errors: { form: res.code } };

  // Transform the grade result to what the client expects
  const learning = res.value.next.phase === 'learning' || res.value.next.phase === 'relearning';
  const streakResult = await getStreak(user.id);
  const streak = streakResult.ok && streakResult.value
    ? { current: streakResult.value.current, longest: streakResult.value.longest, lastActiveDate: streakResult.value.lastActiveDate }
    : { current: 0, longest: 0, lastActiveDate: null };
  return {
    ok: true,
    value: {
      learning,
      queue: [], // client reloads from server
      reviewedCount: 1,
      streak
    }
  };
}

/* ------------------------------------------------------------------ */
/*  Undo last review                                                   */
/* ------------------------------------------------------------------ */

export async function undoLastReview(input: { deckId: string; cardId: string }): Promise<{ ok: boolean; code?: string }> {
  const user = await getSessionUser();
  if (!user) return { ok: false, code: 'error.unexpected' };

  // Load the current card state before undoing — this is the state the
  // undo_review RPC needs for the fields it restores (learning_steps, reps,
  // lapses, due_at, last_reviewed_at).
  const { createSupabaseServerClient } = await import('@/lib/supabase/server');
  const supabase = await createSupabaseServerClient();
  const { data: stateRow } = await supabase
    .from('card_states')
    .select('stability, difficulty, phase, learning_steps, reps, lapses, due_at, last_reviewed_at')
    .eq('user_id', user.id)
    .eq('card_id', input.cardId)
    .maybeSingle();

  const prevState: SrsState = stateRow
    ? {
        stability: stateRow.stability,
        difficulty: stateRow.difficulty,
        phase: stateRow.phase as SrsState['phase'],
        learningSteps: stateRow.learning_steps,
        reps: stateRow.reps,
        lapses: stateRow.lapses,
        dueAt: new Date(stateRow.due_at),
        lastReviewedAt: stateRow.last_reviewed_at ? new Date(stateRow.last_reviewed_at) : null,
      }
    : {
        stability: 0,
        difficulty: 5.0,
        phase: 'new' as SrsState['phase'],
        learningSteps: 0,
        reps: 0,
        lapses: 0,
        dueAt: new Date(),
        lastReviewedAt: null,
      };

  const res = await undoGrade(user.id, { cardId: input.cardId, prevState });
  if (!res.ok) return { ok: false, code: res.code };
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/*  End session                                                        */
/* ------------------------------------------------------------------ */

/**
 * End a review session. The session state is client-side (queue, undo stack);
 * the server has nothing to finalize — reviews are already persisted via
 * gradeCard's apply_review RPC. This action exists so the client can
 * distinguish "user explicitly ended" from "user navigated away".
 */
export async function endSession(_input: { deckId: string }): Promise<{ ok: boolean; code?: string }> {
  const user = await getSessionUser();
  if (!user) return { ok: false, code: 'error.unexpected' };
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/*  Acknowledge changed card                                            */
/* ------------------------------------------------------------------ */

export async function acknowledgeChangedCard(
  cardId: string,
  reset: boolean,
): Promise<{ ok: boolean; code?: string }> {
  const user = await getSessionUser();
  if (!user) return { ok: false, code: 'error.unexpected' };

  const res = await acknowledgeChange(user.id, { cardId, reset });
  if (!res.ok) return { ok: false, code: res.code };
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/*  Save inline edit during review                                     */
/* ------------------------------------------------------------------ */

export async function saveInlineEdit(input: {
  cardId: string;
  frontJson: unknown;
  backJson: unknown;
  frontText: string;
  backText: string;
  confidence: 'again' | 'hard' | 'good' | 'easy' | null;
}): Promise<{ ok: boolean; value?: { savedAt: string; contentVersion: number }; errors?: Record<string, string> }> {
  const user = await getSessionUser();
  if (!user) return { ok: false, errors: { form: 'error.unexpected' } };

  const res = await saveInlineEditDb(user.id, {
    cardId: input.cardId,
    frontJson: input.frontJson as NoteDoc,
    backJson: input.backJson as NoteDoc,
    frontText: input.frontText,
    backText: input.backText,
    confidence: input.confidence,
  });
  if (!res.ok) return { ok: false, errors: { form: res.code } };
  return { ok: true, value: { savedAt: new Date().toISOString(), contentVersion: res.value.contentVersion } };
}