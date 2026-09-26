// Client: review session — queue, FlashcardCard, GradingRow, undo stack,
// changed-card dialog, inline-edit overlay, end-session confirm,
// session-complete summary with streak.
//
// Shortcuts (review scope): Space flip side (reveal / hide), 1-4 grade, e inline edit
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
import { formatNextDue } from '@/lib/review/format-due';

// Ensure KaTeX styles are loaded for flashcard math rendering
import 'katex/dist/katex.min.css';

type Rating = 'again' | 'hard' | 'good' | 'easy';

export function ReviewSession({ deckId, isOwner }: { deckId: string; isOwner: boolean }) {
  const t = useTranslations('review');
  // Root-scoped hook for shared chrome copy (cancel/close).
  const tc = useTranslations('common');
  const router = useRouter();

  const [queue, setQueue] = useState<ReviewQueueItem[]>([]);
  const [phase, setPhase] = useState<'front' | 'back' | 'grading' | 'learning' | 'complete'>('front');
  const [showingBack, setShowingBack] = useState(false);
  // The rating being submitted in the background. Drives the GradingRow ring
  // so the highlight follows the actual choice (previously hardcoded to
  // 'again', which always lit up the first button). Null when idle.
  const [pendingRating, setPendingRating] = useState<Rating | null>(null);
  const [endConfirmOpen, setEndConfirmOpen] = useState(false);
  const [inlineEditOpen, setInlineEditOpen] = useState(false);
  const [inlineEditCard, setInlineEditCard] = useState<ReviewQueueItem | null>(null);
  const [changedCardOpen, setChangedCardOpen] = useState(false);
  const [undoStack, setUndoStack] = useState<ReviewQueueItem[]>([]);
  const [sessionComplete, setSessionComplete] = useState(false);
  const [summary, setSummary] = useState<{ reviewed: number; streak: { current: number; longest: number; lastActiveDate: string | null }; nextDueAt: string | null } | null>(null);
  const [nextDueAt, setNextDueAt] = useState<string | null>(null);
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

  // Cards already seen this session (initial load + prefetched batches).
  // Guards the prefetch append against duplicates when the server window
  // still contains cards we already hold locally.
  const seenIdsRef = useRef<Set<string>>(new Set());
  const prefetchInFlightRef = useRef(false);

  // Load (or reload) the queue. Extracted so grading can refetch when the
  // local window drains while the server still has due cards (SESSION_CAP
  // truncates the initial fetch — the queue is a rolling window).
  // initial=true replaces (first paint); otherwise appends unique cards so a
  // background prefetch never duplicates or reorders the current card.
  const load = useCallback(async (initial = false) => {
    if (!initial) {
      if (prefetchInFlightRef.current) return;
      prefetchInFlightRef.current = true;
    }
    try {
      const res = await getReviewQueue(deckId);
      if (res.ok) {
        const fresh = res.value.queue.filter((c) => !seenIdsRef.current.has(c.card.id));
        fresh.forEach((c) => seenIdsRef.current.add(c.card.id));
        if (initial) {
          res.value.queue.forEach((c) => seenIdsRef.current.add(c.card.id));
          setQueue(res.value.queue);
          setTotalCount(res.value.queue.length);
        } else if (fresh.length > 0) {
          setQueue((q) => [...q, ...fresh]);
          setTotalCount((prev) => prev + fresh.length);
        }
        setNextDueAt(res.value.nextDueAt);
        return res.value;
      }
      return null;
    } finally {
      if (!initial) prefetchInFlightRef.current = false;
    }
  }, [deckId]);

  // Load initial queue. load() is an async fetch whose setState happens after
  // the await — not the synchronous setState-in-effect the rule targets, but
  // the rule cannot see that through the useCallback boundary.
  useEffect(() => {
    load(true);
  }, [load]);

  // Changed-card dialog: when the front card carries a pending content change
  // (content_version > seen_version) that this session hasn't prompted for
  // yet, surface it before the student reviews. Dismissing acknowledges the
  // change and the card stays in the queue with `changed` still true, so the
  // prompted set prevents a re-prompt on the same card (phase-03b F5).
  //
  // Owners never see it: the deck owner IS the author, and startReview never
  // flags their own cards as changed. This guard is belt-and-braces so a stale
  // or refetched queue item cannot reopen the dialog regardless.
  useEffect(() => {
    const current = queue[0];
    if (!current || !current.changed) return;
    if (isOwner) return;
    if (promptedChangedRef.current.has(current.card.id)) return;
    promptedChangedRef.current.add(current.card.id);
    setChangedCardOpen(true);
  }, [queue, isOwner]);

  // Reveal handler: flips the card and moves to grading
  const handleReveal = useCallback(() => {
    if (phaseRef.current === 'front') {
      setShowingBack(true);
      setPhase('grading');
      setRevealTimestamp(Date.now());
    }
  }, []);

  // Grade handler — optimistic: advance to the next (already cached) card
  // immediately, then persist in the background. The next card is local, so
  // perceived latency is ~0ms even when the server takes 1-2s.
  // Note: no gradingInFlight gate — the phase flip already prevents double
  // submits on the same card, and the next card must stay gradable while a
  // previous submit is still in flight.
  const handleGrade = useCallback((rating: Rating) => {
    if (phaseRef.current !== 'grading') return;
    const current = queue[0];
    if (!current) return;
    setPendingRating(rating);

    const responseTimeMs = Date.now() - revealTimestamp;
    const wasEdited = editedDuringReview;
    const nextLength = queue.length - 1;

    // Advance instantly from the local window.
    setUndoStack((s) => [...s, current]);
    setQueue((q) => q.slice(1));
    setShowingBack(false);
    setPhase('front');
    setEditedDuringReview(false);
    setReviewedCount((n) => n + 1);

    // Prefetch the next window before we run dry (was: only at length <= 1,
    // which showed a gap). Appends unique cards in the background.
    if (nextLength <= 10) {
      load(false);
    }

    (async () => {
      const res = await submitReview({
        deckId,
        cardId: current.card.id,
        rating,
        responseTimeMs,
        editedDuringReview: wasEdited,
      });
      setPendingRating(null);
      if (!res.ok) {
        // Persist failed — restore the card to the front so no review is lost.
        setQueue((q) => [current, ...q]);
        setUndoStack((s) => s.slice(0, -1));
        setReviewedCount((n) => Math.max(0, n - 1));
        setError(res.errors?.form ?? 'error.unexpected');
        return;
      }

      if (res.value?.learning) {
        // Learning card: short pause then re-show until graduated
        setPhase('learning');
        setTimeout(() => setPhase('front'), 800);
      }

      // Session end is decided locally: the queue drained AND the server has
      // nothing more (prefetch already ran above). Check explicitly so an
      // 'again' re-queue on the server doesn't get missed.
      if (nextLength <= 0) {
        const fresh = await load(false);
        if (fresh && fresh.queue.length === 0) {
          setSummary({
            reviewed: reviewedCount + 1,
            streak: res.value?.streak ?? { current: 0, longest: 0, lastActiveDate: null },
            nextDueAt: res.value?.nextDueAt ?? fresh.nextDueAt ?? null,
          });
          setSessionComplete(true);
        }
      }
    })();
  }, [deckId, queue, revealTimestamp, editedDuringReview, reviewedCount, load]);

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

  // Space: swap the side that is shown. Space must never grade or "click" the
  // focused control like a regular form key would. Revealing still drives the
  // state machine (handleReveal) so phase reaches 'grading' and the row,
  // Edit button and 1-4/e bindings are live on desktop; the provider
  // preventDefaults the matched key so a focused grade button can't also be
  // natively activated.
  useShortcut('review', ' ', () => {
    if (phaseRef.current === 'front') {
      handleReveal();
    } else if (phaseRef.current === 'grading') {
      setShowingBack(false);
      setPhase('front');
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
    const next = summary.nextDueAt ? formatNextDue(summary.nextDueAt) : null;
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-6">
        <h1 className="text-ui-lg font-semibold text-primary">{t('sessionComplete.title')}</h1>
        <p className="text-ui-base text-secondary">
          {t('sessionComplete.reviewed', { count: summary.reviewed })}
        </p>
        <p className="text-ui-sm text-tertiary">
          {t('sessionComplete.streak', { current: summary.streak.current, longest: summary.streak.longest })}
        </p>
        {next ? (
          <p className="text-ui-sm text-secondary" title={next.absolute}>
            {t('sessionComplete.nextDue', { when: next.relative })}
          </p>
        ) : null}
        <Button variant="primary" onClick={() => router.push(`/app/decks/${deckId}`)}>
          {t('sessionComplete.done')}
        </Button>
      </div>
    );
  }

  if (!current) {
    const next = nextDueAt ? formatNextDue(nextDueAt) : null;
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6">
        <p className="text-ui-lg font-semibold text-primary">{next ? t('allCaughtUp') : t('noDue')}</p>
        {next ? (
          <p className="text-ui-base text-secondary" title={next.absolute}>
            {t('noDueNext', { when: next.relative })}
          </p>
        ) : null}
        <Button variant="primary" onClick={() => router.push(`/app/decks/${deckId}`)}>
          {t('backToDeck')}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      {/* Counter fixed at top-left */}
      <div className="fixed top-4 left-4 z-10 text-ui-sm text-tertiary">
        {totalCount === 0 ? 1 : totalCount - queue.length + 1} / {totalCount}
      </div>

      {/* Card fills the available space, centered vertically; scrolls
          internally on short viewports so the grading row never leaves screen */}
      <div className="flex min-h-0 flex-1 justify-center overflow-y-auto p-4">
        <div className="m-auto w-full">
          <FlashcardCard
            front={current.card.frontJson}
            back={current.card.backJson}
            showingBack={showingBack}
            onReveal={handleReveal}
          />
        </div>
      </div>

      {/*
        Grading row fixed at bottom — thumb-first zone (§6). Always rendered:
        before reveal it is an invisible placeholder of identical height so the
        card never shifts when the row appears.
      */}
      <div className="shrink-0 p-4 pb-safe">
        <div
          className={phase === 'grading' || phase === 'learning' ? undefined : 'invisible'}
          aria-hidden={phase === 'grading' || phase === 'learning' ? undefined : true}
          inert={phase === 'grading' || phase === 'learning' ? undefined : true}
        >
          {isOwner ? (
            <div className="mb-2">
              <Button
                variant="secondary"
                onClick={openInlineEdit}
                className="text-ui-sm"
                tabIndex={phase === 'grading' || phase === 'learning' ? undefined : -1}
              >
                {t('editCard')}
              </Button>
            </div>
          ) : null}
          <GradingRow
            previews={previews}
            onGrade={handleGrade}
            disabled={phase !== 'grading' && phase !== 'learning'}
            loadingRating={pendingRating}
          />
        </div>
      </div>

      {error && <p className="text-ui-sm text-danger fixed bottom-4">{error}</p>}

      <InlineEditOverlay
        open={inlineEditOpen}
        onClose={() => { setInlineEditOpen(false); setInlineEditCard(null); }}
        cardId={inlineEditCard?.card.id ?? ''}
        front={inlineEditCard?.card.frontJson ?? { type: 'doc', content: [] }}
        back={inlineEditCard?.card.backJson ?? { type: 'doc', content: [] }}
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