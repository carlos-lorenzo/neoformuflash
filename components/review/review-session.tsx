// Client: review session — queue, FlashcardCard, GradingRow, undo stack,
// changed-card dialog, inline-edit overlay, end-session confirm,
// session-complete summary with streak.
//
// Shortcuts (review scope): Space reveal→Good, 1-4 grade, e inline edit
// (owned decks only), u undo, Esc end session (confirm if cards remain).

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { getReviewQueue, submitReview, undoLastReview, acknowledgeChangedCard } from '@/app/(review)/actions';
import type { ReviewQueueItem } from '@/lib/db/review';

// Ensure KaTeX styles are loaded for flashcard math rendering
import 'katex/dist/katex.min.css';

const RATINGS = ['again', 'hard', 'good', 'easy'] as const;

export function ReviewSession({ deckId, isOwner }: { deckId: string; isOwner: boolean }) {
  const t = useTranslations('review');
  // Root-scoped hook for shared chrome copy (cancel/close).
  const tc = useTranslations('common');
  const router = useRouter();

  const [queue, setQueue] = useState<ReviewQueueItem[]>([]);
  const [phase, setPhase] = useState<'front' | 'back' | 'grading' | 'learning' | 'complete'>('front');
  const [showingBack, setShowingBack] = useState(false);
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
  const [reviewedCount, setReviewedCount] = useState(0);
  const [editedDuringReview, setEditedDuringReview] = useState(false);
  // Cards the changed-card dialog has already prompted for this session.
  // The front card stays `changed: true` after a dismissal (acknowledging
  // doesn't move seen_version to current when "keep"), so without this the
  // dialog would reopen immediately after closing (phase-03b F5).
  const promptedChangedRef = useRef<Set<string>>(new Set());

// Ref to track current phase for shortcut handlers.
// Avoids stale closure when multiple keydowns fire before React re-renders.
const phaseRef = useRef(phase);
useEffect(() => {
  phaseRef.current = phase;
}, [phase]);

useActiveScope('review');

  // Load (or reload) the queue. Extracted so grading can refetch when the
  // local window drains while the server still has due cards (SESSION_CAP
  // truncates the initial fetch — the queue is a rolling window).
  const load = useCallback(async () => {
    const res = await getReviewQueue(deckId);
    if (res.ok) {
      setQueue(res.value.queue);
      setTotalCount((prev) => prev + res.value.queue.length);
    }
  }, [deckId]);

  // Load initial queue. load() is an async fetch whose setState happens after
  // the await — not the synchronous setState-in-effect the rule targets, but
  // the rule cannot see that through the useCallback boundary.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  // Changed-card dialog: when the front card carries a pending content change
  // (content_version > seen_version) that this session hasn't prompted for
  // yet, surface it before the student reviews. Dismissing acknowledges the
  // change and the card stays in the queue with `changed` still true, so the
  // prompted set prevents a re-prompt on the same card (phase-03b F5).
  useEffect(() => {
    const current = queue[0];
    if (!current || !current.changed) return;
    if (promptedChangedRef.current.has(current.card.id)) return;
    promptedChangedRef.current.add(current.card.id);
    setChangedCardOpen(true);
  }, [queue]);

  // Reveal handler: flips the card and moves to grading
  const handleReveal = useCallback(() => {
    if (phaseRef.current === 'front') {
      setShowingBack(true);
      setPhase('grading');
      setRevealTimestamp(Date.now());
    }
  }, []);

  // Grade handler
  const handleGrade = useCallback((rating: typeof RATINGS[number]) => {
    if (phaseRef.current !== 'grading' || gradingInFlight) return;
    const current = queue[0];
    if (!current) return;
    // setGradingInFlight must come AFTER the !current guard: an empty queue
    // would otherwise leave the grading row permanently locked (phase-03b
    // defect 1).
    setGradingInFlight(true);

    (async () => {
      const res = await submitReview({
        deckId,
        cardId: current.card.id,
        rating,
        responseTimeMs: Date.now() - revealTimestamp,
        editedDuringReview,
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
      setShowingBack(false);
      setPhase('front');
      setGradingInFlight(false);
      setEditedDuringReview(false);
      setReviewedCount((n) => n + 1);

      if (res.value?.learning) {
        // Learning card: short pause then re-show until graduated
        setPhase('learning');
        setTimeout(() => setPhase('front'), 800);
      }

      const remaining = res.value?.remainingCount ?? 0;
      if (remaining === 0) {
        setSummary({
          reviewed: reviewedCount + 1,
          streak: res.value?.streak ?? { current: 0, longest: 0, lastActiveDate: null },
        });
        setSessionComplete(true);
      } else if (queue.length <= 1) {
        // Local window drained but the server still has due cards — refetch
        // the next batch instead of ending the session.
        load();
      }
    })();
  }, [deckId, gradingInFlight, queue, revealTimestamp, editedDuringReview, reviewedCount, load]);

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
  }, { label: 'shortcuts.review.undo' });

  // Space: swap sides (flip card)
  useShortcut('review', ' ', () => {
    if (phaseRef.current === 'front' || phaseRef.current === 'grading') {
      setShowingBack((prev) => !prev);
    }
  }, { label: 'shortcuts.review.revealOrGood' });

  // 1-4: grade directly
  useShortcut('review', '1', () => { if (phaseRef.current === 'grading') handleGrade('again'); }, { label: 'shortcuts.review.gradeAgain' });
  useShortcut('review', '2', () => { if (phaseRef.current === 'grading') handleGrade('hard'); }, { label: 'shortcuts.review.gradeHard' });
  useShortcut('review', '3', () => { if (phaseRef.current === 'grading') handleGrade('good'); }, { label: 'shortcuts.review.gradeGood' });
  useShortcut('review', '4', () => { if (phaseRef.current === 'grading') handleGrade('easy'); }, { label: 'shortcuts.review.gradeEasy' });

  // e: inline edit (owner only) — shared handler for shortcut + visible button
  const openInlineEdit = useCallback(() => {
    if (!isOwner) return;
    const current = queue[0];
    if (current && phaseRef.current === 'grading') {
      setInlineEditCard(current);
      setInlineEditOpen(true);
    }
  }, [isOwner, queue]);

  useShortcut('review', 'e', openInlineEdit, { label: 'shortcuts.review.inlineEdit' });

  // Esc: end session
  useShortcut('review', 'Escape', () => {
    if (queue.length > 0) setEndConfirmOpen(true);
  }, { label: 'shortcuts.review.endSession' });

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
          showingBack={showingBack}
          onReveal={handleReveal}
        />
      </div>

      {/* Grading row fixed at bottom — thumb-first zone (§6) */}
      {(phase === 'grading' || phase === 'learning') && (
        <div className="shrink-0 p-4 pb-safe">
          {isOwner ? (
            <div className="mb-2">
              <Button
                variant="secondary"
                onClick={openInlineEdit}
                className="text-ui-sm"
              >
                {t('editCard')}
              </Button>
            </div>
          ) : null}
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
        confidence={inlineEditCard?.card.confidence ?? null}
        onSave={() => {
          setInlineEditOpen(false);
          setInlineEditCard(null);
          // The card was edited mid-review; the next grade must record it so
          // the content_version change flag stays accurate (phase-03b F4).
          setEditedDuringReview(true);
        }}
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
        closeLabel={tc('close')}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setEndConfirmOpen(false)}>
              {tc('cancel')}
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