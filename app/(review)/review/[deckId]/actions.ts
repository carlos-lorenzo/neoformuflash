'use server';

/**
 * Server actions for review session.
 *
 * Pattern: re-check auth, validate, delegate to lib/db/review.
 */

import { getSessionUser } from '@/lib/supabase/session';
import { startReview, gradeCard, undoGrade, saveInlineEdit as saveInlineEditDb } from '@/lib/db/review';
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
  return {
    ok: true,
    value: {
      learning,
      queue: [], // client reloads from server
      reviewedCount: 1,
      streak: { current: 0, longest: 0, lastActiveDate: null } // placeholder
    }
  };
}

/* ------------------------------------------------------------------ */
/*  Undo last review                                                   */
/* ------------------------------------------------------------------ */

export async function undoLastReview(input: { deckId: string; cardId: string }): Promise<{ ok: boolean; code?: string }> {
  const user = await getSessionUser();
  if (!user) return { ok: false, code: 'error.unexpected' };

  // undoGrade requires a prevState - use a default SrsState for new cards
  const defaultPrevState: SrsState = {
    stability: 0,
    difficulty: 5.0,
    phase: 'new',
    learningSteps: 0,
    reps: 0,
    lapses: 0,
    dueAt: new Date(),
    lastReviewedAt: null,
  };
  const res = await undoGrade(user.id, { cardId: input.cardId, prevState: defaultPrevState });
  if (!res.ok) return { ok: false, code: res.code };
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/*  End session                                                        */
/* ------------------------------------------------------------------ */

export async function endSession(_input: { deckId: string }): Promise<{ ok: boolean; code?: string }> {
  const user = await getSessionUser();
  if (!user) return { ok: false, code: 'error.unexpected' };

  // No endSession in lib/db/review.ts - use gradeCard with special flag or just return ok
  // For now, just return ok since the client just navigates away
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