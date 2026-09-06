'use server';

/**
 * Server actions for review session.
 *
 * Pattern: re-check auth, validate, delegate to lib/db/review.
 */

import { getSessionUser } from '@/lib/supabase/session';
import { startReview, gradeCard, undoGrade, saveInlineEdit as saveInlineEditDb, acknowledgeChange } from '@/lib/db/review';
import { getStreak } from '@/lib/db/decks';
import { extractText } from '@neoformuflash/contracts';
import { proseToUnion } from '@/lib/editor/serialize';
import type { ReviewQueueCard } from '@/lib/db/review';
import type { SrsState } from '@neoformuflash/contracts';

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
  editedDuringReview: boolean;
}): Promise<{
  ok: boolean;
  value?: { learning: boolean; remainingCount: number; streak: { current: number; longest: number; lastActiveDate: string | null } };
  errors?: Record<string, string>;
}> {
  const user = await getSessionUser();
  if (!user) return { ok: false, errors: { form: 'error.unexpected' } };

  const res = await gradeCard(user.id, {
    cardId: input.cardId,
    rating: input.rating,
    elapsedMs: input.responseTimeMs,
    editedDuringReview: input.editedDuringReview,
  });
  if (!res.ok) return { ok: false, errors: { form: res.code } };

  // Re-run startReview to get the TRUE remaining count. The client's local
  // queue is only the initial SESSION_CAP window; a card graded 'again' is
  // re-added to the queue, so the server count is what decides whether the
  // session is actually over. The old `queue: []` made every grade look like
  // the last one — session-complete fired after each card (phase-03b defect 1).
  const remaining = await startReview(user.id, input.deckId);

  const learning = res.value.next.phase === 'learning' || res.value.next.phase === 'relearning';
  const streakResult = await getStreak(user.id);
  const streak = streakResult.ok && streakResult.value
    ? { current: streakResult.value.current, longest: streakResult.value.longest, lastActiveDate: streakResult.value.lastActiveDate }
    : { current: 0, longest: 0, lastActiveDate: null };
  return {
    ok: true,
    value: {
      learning,
      remainingCount: remaining.ok ? remaining.value.cards.length : 0,
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

/*
 * Content-only. The card editor never sends `confidence` (new cards are
 * unseen until graded), so an inline save can't overwrite a review outcome.
 */
export async function saveInlineEdit(input: {
  cardId: string;
  frontJson: unknown;
  backJson: unknown;
}): Promise<{ ok: boolean; value?: { savedAt: string; contentVersion: number }; errors?: Record<string, string> }> {
  const user = await getSessionUser();
  if (!user) return { ok: false, errors: { form: 'error.unexpected' } };

  // Re-validate the content server-side (D3 — same convention as saveNote):
  // the client JSON is untrusted and the client-supplied text is discarded in
  // favour of extractText over the validated union. A forged front_text would
  // otherwise control the content_version change signal subscribers depend on.
  const front = proseToUnion(input.frontJson);
  if (!front.ok) return { ok: false, errors: { form: front.code } };
  const back = proseToUnion(input.backJson);
  if (!back.ok) return { ok: false, errors: { form: back.code } };

  const res = await saveInlineEditDb(user.id, {
    cardId: input.cardId,
    frontJson: front.value,
    backJson: back.value,
    frontText: extractText(front.value),
    backText: extractText(back.value),
  });
  if (!res.ok) return { ok: false, errors: { form: res.code } };
  return { ok: true, value: { savedAt: new Date().toISOString(), contentVersion: res.value.contentVersion } };
}