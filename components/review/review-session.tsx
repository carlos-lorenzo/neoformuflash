// Client: review session — queue, FlashcardCard, GradingRow, undo stack,
// changed-card dialog, inline-edit overlay, end-session confirm,
// session-complete summary with streak.
//
// Shortcuts (review scope): Space reveal→Good, 1-4 grade, e inline edit
// (owned decks only), u undo, Esc end session (confirm if cards remain).

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useActiveScope } from '@/lib/shortcuts/use-scope';
import { useShortcut } from '@/lib/shortcuts/use-shortcut';
import { FlashcardCard } from './flashcard-card';
import { GradingRow } from './grading-row';
import { InlineEditOverlay } from './inline-edit-overlay';
import { ChangedCardDialog } from './changed-card-dialog';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { getReviewQueue, submitReview, undoLastReview, acknowledgeChangedCard } from '@/app/(review)/review/[deckId]/actions';
import type { ReviewQueueItem } from '@/lib/db/review';

const RATINGS = ['again', 'hard', 'good', 'easy'] as const;

export function ReviewSession({ deckId, isOwner }: { deckId: string; isOwner: boolean }) {
  const t = useTranslations('review');
  const router = useRouter();

  const [queue, setQueue] = useState<ReviewQueueItem[]>([]);
  const [phase, setPhase] = useState<'front' | 'back' | 'grading' | 'learning' | 'complete'>('front');
  const [revealed, setRevealed] = useState(false);
  const [gradingInFlight, setGradingInFlight] = useState(false);
  const [endConfirmOpen, setEndConfirmOpen] = useState(false);
  const [inlineEditOpen, setInlineEditOpen] = useState(false);
  const [inlineEditCard, setInlineEditCard] = useState<ReviewQueueItem | null>(null);
  const [changedCardOpen, setChangedCardOpen] = useState(false);
  const [undoStack, setUndoStack] = useState<ReviewQueueItem[]>([]);
  const [sessionComplete, setSessionComplete] = useState(false);
  const [summary, setSummary] = useState<{ reviewed: number; streak: { current: number; longest: number; lastActiveDate: string | null } } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [revealTimestamp, setRevealTimestamp] = useState(0);

  useActiveScope('review');

  // Load initial queue
  useEffect(() => {
    async function load() {
      const res = await getReviewQueue(deckId);
      if (res.ok) {
        setQueue(res.value.queue);
        setTotalCount(res.value.queue.length);
      }
    }
    load();
  }, [deckId]);

  // Reveal handler: flips the card and moves to grading
  const handleReveal = useCallback(() => {
    if (phase === 'front') {
      setRevealed(true);
      setPhase('grading');
      setRevealTimestamp(Date.now());
    }
  }, [phase]);

  // Grade handler
  const handleGrade = useCallback((rating: typeof RATINGS[number]) => {
    if (phase !== 'grading' || gradingInFlight) return;
    setGradingInFlight(true);
    const current = queue[0];
    if (!current) return;

    (async () => {
      const res = await submitReview({
        deckId,
        cardId: current.card.id,
        rating,
        responseTimeMs: Date.now() - revealTimestamp,
      });
      if (!res.ok) {
        setError(res.errors?.form ?? 'error.unexpected');
        setGradingInFlight(false);
        return;
      }

      // Push current card to undo stack
      setUndoStack((s) => [...s, current]);

      // Advance
      setQueue((q) => q.slice(1));
      setRevealed(false);
      setPhase('front');
      setGradingInFlight(false);

      if (res.value?.learning) {
        // Learning card: short pause then re-show until graduated
        setPhase('learning');
        setTimeout(() => setPhase('front'), 800);
      }

      if (res.value?.queue && res.value.queue.length === 0) {
        setSummary({ reviewed: res.value.reviewedCount, streak: res.value.streak });
        setSessionComplete(true);
      }
    })();
  }, [deckId, phase, gradingInFlight, queue]);

  // Undo last review
  useShortcut('review', 'u', () => {
    if (undoStack.length === 0) return;
    (async () => {
      const last = undoStack[undoStack.length - 1];
      if (!last) return;
      const res = await undoLastReview({ deckId, cardId: last.card.id });
      if (res.ok) {
        setQueue((q) => [last, ...q]);
        setUndoStack((s) => s.slice(0, -1));
      }
    })();
  }, { label: 'undo' });

  // Space: reveal or Good
  useShortcut('review', ' ', () => {
    if (phase === 'front') handleReveal();
    else if (phase === 'grading') handleGrade('good');
  }, { label: 'revealOrGood' });

  // 1-4: grade directly
  useShortcut('review', '1', () => { if (phase === 'grading') handleGrade('again'); }, { label: 'gradeAgain' });
  useShortcut('review', '2', () => { if (phase === 'grading') handleGrade('hard'); }, { label: 'gradeHard' });
  useShortcut('review', '3', () => { if (phase === 'grading') handleGrade('good'); }, { label: 'gradeGood' });
  useShortcut('review', '4', () => { if (phase === 'grading') handleGrade('easy'); }, { label: 'gradeEasy' });

  // e: inline edit (owner only)
  useShortcut('review', 'e', () => {
    if (!isOwner) return;
    const current = queue[0];
    if (current && phase === 'grading') {
      setInlineEditCard(current);
      setInlineEditOpen(true);
    }
  }, { label: 'inlineEdit' });

  // Esc: end session
  useShortcut('review', 'Escape', () => {
    if (queue.length > 0) setEndConfirmOpen(true);
  }, { label: 'endSession' });

  // Interval previews for GradingRow
  const previews = useMemo(() => {
    const current = queue[0];
    if (!current) return { again: '0m', hard: '0m', good: '0m', easy: '0m' };
    return {
      again: current.previews.again,
      hard: current.previews.hard,
      good: current.previews.good,
      easy: current.previews.easy,
    };
  }, [queue]);

  const current = queue[0];

  if (sessionComplete && summary) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-6">
        <h1 className="text-ui-lg font-semibold text-primary">{t('sessionComplete.title')}</h1>
        <p className="text-ui-base text-secondary">
          {t('sessionComplete.reviewed', { count: summary.reviewed })}
        </p>
        <p className="text-ui-sm text-tertiary">
          {t('sessionComplete.streak', { current: summary.streak.current, longest: summary.streak.longest })}
        </p>
        <Button variant="primary" onClick={() => router.push(`/app/decks/${deckId}`)}>
          {t('sessionComplete.done')}
        </Button>
      </div>
    );
  }

  if (!current) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6">
        <p className="text-ui-lg font-semibold text-primary">{t('noDue')}</p>
        <Button variant="primary" onClick={() => router.push(`/app/decks/${deckId}`)}>
          {t('backToDeck')}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col">
      {/* Counter fixed at top-left */}
      <div className="fixed top-4 left-4 z-10 text-ui-sm text-tertiary">
        {totalCount === 0 ? 1 : totalCount - queue.length + 1} / {totalCount}
      </div>

      {/* Card fills the available space, centered vertically */}
      <div className="flex-1 flex items-center justify-center p-4">
        <FlashcardCard
          front={current.card.frontJson}
          back={current.card.backJson}
          revealed={revealed || phase === 'grading' || phase === 'learning'}
          onReveal={handleReveal}
        />
      </div>

      {/* Grading row fixed at bottom — thumb-first zone (§6) */}
      {(phase === 'grading' || phase === 'learning') && (
        <div className="shrink-0 p-4 pb-safe">
          <GradingRow
            previews={previews}
            onGrade={handleGrade}
            disabled={gradingInFlight}
            loadingRating={gradingInFlight ? RATINGS[0] : null}
          />
        </div>
      )}

      {error && <p className="text-ui-sm text-danger fixed bottom-4">{error}</p>}

      <InlineEditOverlay
        open={inlineEditOpen}
        onClose={() => { setInlineEditOpen(false); setInlineEditCard(null); }}
        cardId={inlineEditCard?.card.id ?? ''}
        front={inlineEditCard?.card.frontJson ?? { type: 'doc', content: [] }}
        back={inlineEditCard?.card.backJson ?? { type: 'doc', content: [] }}
        confidence={null}
        onSave={() => { setInlineEditOpen(false); setInlineEditCard(null); }}
      />

      <ChangedCardDialog
        open={changedCardOpen}
        onClose={() => setChangedCardOpen(false)}
        onKeep={async () => {
          const card = queue[0];
          if (card) await acknowledgeChangedCard(card.card.id, false);
          setChangedCardOpen(false);
        }}
        onStartOver={async () => {
          const card = queue[0];
          if (card) {
            await acknowledgeChangedCard(card.card.id, true);
            setQueue((q) => q.slice(1));
            setPhase('front');
          }
          setChangedCardOpen(false);
        }}
      />

      <Dialog
        open={endConfirmOpen}
        onOpenChange={setEndConfirmOpen}
        title={t('endConfirm.title')}
        description={t('endConfirm.body', { count: queue.length })}
        closeLabel={t('common.close')}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setEndConfirmOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button variant="primary" onClick={() => { router.push(`/app/decks/${deckId}`); }}>
              {t('endConfirm.leave')}
            </Button>
          </div>
        }
      >
        <p className="text-ui-sm text-secondary">{t('endConfirm.body', { count: queue.length })}</p>
      </Dialog>
    </div>
  );
}