// Client: practice session — study without affecting the FSRS schedule.
//
// Differences from ReviewSession, stated in the UI banner and not just here:
//   - Queue is every card in the deck (no due filter, no daily new-card cap).
//   - Next logs to practice_logs with rating 'good' only; card_states /
//     review_logs are never touched, so intervals and due dates cannot change.
//   - Single "Next card" button instead of confidence grades (grade is moot).
//   - No undo / inline-edit / changed-card dialog (nothing scheduled to fix).
//   - Streak still counts via the practice_logs_bump_streak trigger.

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useActiveScope } from '@/lib/shortcuts/use-scope';
import { useShortcut } from '@/lib/shortcuts/use-shortcut';
import { FlashcardCard } from './flashcard-card';
import { Button } from '@/components/ui/button';
import { getPracticeQueue, submitPractice } from '@/app/(review)/actions';
import type { NoteDoc } from '@neoformuflash/contracts';

type Confidence = 'again' | 'hard' | 'good' | 'easy' | null;

export type PracticeListItem = {
  id: string;
  frontText: string;
  confidence: Confidence;
};

type QueueItem = {
  id: string;
  frontJson: NoteDoc;
  backJson: NoteDoc;
};

export function PracticeSession({
  deckId,
  deckTitle,
  initialCards,
}: {
  deckId: string;
  deckTitle: string;
  initialCards: PracticeListItem[];
}) {
  const t = useTranslations('practice');
  const router = useRouter();

  const [stage, setStage] = useState<'setup' | 'session' | 'complete'>('setup');
  const [selected, setSelected] = useState<(Confidence | 'unset')[]>(['again', 'hard', 'good', 'easy', 'unset']);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [shuffle, setShuffle] = useState(false);
  const [endless, setEndless] = useState(false);

  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [phase, setPhase] = useState<'front' | 'grading'>('front');
  const [showingBack, setShowingBack] = useState(false);
  const [practicedCount, setPracticedCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [streak, setStreak] = useState<{ current: number; longest: number; lastActiveDate: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const phaseRef = useRef(phase);
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useActiveScope('review');

  const visibleCards = useMemo(() => {
    const sel = new Set(selected);
    return initialCards.filter((c) => {
      const key = (c.confidence ?? 'unset') as Confidence | 'unset';
      if (!sel.has(key)) return false;
      if (excluded.has(c.id)) return false;
      return true;
    });
  }, [initialCards, selected, excluded]);

  const toggleConfidence = useCallback((key: Confidence | 'unset') => {
    setSelected((s) => (s.includes(key) ? s.filter((k) => k !== key) : [...s, key]));
  }, []);

  const toggleCard = useCallback((id: string) => {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleStart = useCallback(async () => {
    const confidences = selected.map((s) => (s === 'unset' ? null : (s as Confidence)));
    const res = await getPracticeQueue(deckId, {
      confidences,
      excludeIds: [...excluded],
      shuffle,
    });
    if (!res.ok) {
      setError(res.code);
      return;
    }
    setQueue(
      res.value.queue.map((q) => ({
        id: q.id,
        frontJson: q.frontJson as unknown as NoteDoc,
        backJson: q.backJson as unknown as NoteDoc,
      })),
    );
    setTotalCount(res.value.queue.length);
    setStreak(res.value.streak);
    setPracticedCount(0);
    setPhase('front');
    setShowingBack(false);
    setStage('session');
  }, [deckId, selected, excluded, shuffle]);

  const handleEnd = useCallback(() => {
    setStage('complete');
  }, []);

  const handleReveal = useCallback(() => {
    if (phaseRef.current === 'front') {
      setShowingBack(true);
      setPhase('grading');
    }
  }, []);

  // Advance instantly (queue is fully cached upfront); log in the background
  // as 'good' so the streak still counts without blocking the next card.
  // No in-flight gate: the phase flip prevents double-advance on the same
  // card, and the next card must stay available while a log is pending.
  const handleNext = useCallback(
    () => {
      if (phaseRef.current !== 'grading') return;
      const current = queue[0];
      if (!current) return;

      const done = practicedCount + 1;
      setPracticedCount(done);
      // Endless mode cycles the card to the back of the queue instead of
      // dropping it, so the selected set repeats until the user ends it.
      setQueue((q) => (endless ? [...q.slice(1), current] : q.slice(1)));
      setShowingBack(false);
      setPhase('front');
      if (!endless && queue.length <= 1) setStage('complete');

      (async () => {
        const res = await submitPractice({ cardId: current.id, rating: 'good' });
        if (!res.ok) {
          setError(res.errors?.form ?? 'error.unexpected');
          return;
        }
        if (res.value?.streak) setStreak(res.value.streak);
      })();
    },
    [queue, practicedCount, endless],
  );

  useShortcut(
    'review',
    ' ',
    () => {
      if (stage !== 'session') return;
      if (phaseRef.current === 'front') handleReveal();
      else if (phaseRef.current === 'grading') handleNext();
    },
    { label: 'shortcuts.review.revealOrGood' },
  );
  useShortcut('review', 'Enter', () => { if (stage === 'session' && phaseRef.current === 'grading') handleNext(); }, { label: 'shortcuts.review.revealOrGood' });
  useShortcut('review', 'Escape', () => { if (stage === 'session') handleEnd(); }, { label: 'shortcuts.review.endSession' });

  if (stage === 'setup') {
    return (
      <div className="mx-auto w-full max-w-measure px-4 py-8">
        <h1 className="text-ui-lg font-semibold text-primary">{t('title', { deck: deckTitle })}</h1>

        <p className="mt-4 rounded-sm border border-warning bg-raised px-4 py-2 text-ui-xs text-secondary" role="note">
          {t('bannerShort')}
        </p>

        {initialCards.length === 0 ? (
          <p className="mt-6 text-ui-base text-secondary">{t('emptyDeck')}</p>
        ) : (
          <>
            <section className="mt-6">
              <h2 className="text-ui-base font-semibold text-primary">{t('filters.title')}</h2>
              <p className="mt-1 text-ui-sm text-secondary">{t('filters.confidence')}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {(['again', 'hard', 'good', 'easy', 'unset'] as const).map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => toggleConfidence(key)}
                    aria-pressed={selected.includes(key)}
                    className={`rounded-sm border px-3 py-2 text-ui-sm font-medium ${
                      selected.includes(key)
                        ? 'border-accent bg-accent text-on-accent'
                        : 'border-subtle text-secondary hover:text-primary'
                    }`}
                  >
                    {t(`filters.${key}`)}
                  </button>
                ))}
              </div>
              <label className="mt-4 flex items-center gap-2 text-ui-sm text-secondary">
                <input type="checkbox" checked={shuffle} onChange={(e) => setShuffle(e.target.checked)} />
                {t('filters.shuffle')}
              </label>
              <label className="mt-2 flex items-center gap-2 text-ui-sm text-secondary">
                <input type="checkbox" checked={endless} onChange={(e) => setEndless(e.target.checked)} />
                {t('filters.endless')}
              </label>
            </section>

            <section className="mt-6">
              <p className="text-ui-sm text-secondary">{t('filters.all', { count: visibleCards.length, total: initialCards.length })}</p>
              <ul className="mt-2 flex max-h-outline flex-col gap-1 overflow-y-auto rounded-md border border-subtle p-2">
                {visibleCards.length === 0 ? (
                  <li className="p-2 text-ui-sm text-tertiary">{t('noMatch')}</li>
                ) : (
                  initialCards
                    .filter((c) => {
                      const key = (c.confidence ?? 'unset') as Confidence | 'unset';
                      return selected.includes(key);
                    })
                    .map((c) => (
                      <li key={c.id}>
                        <label className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-2 hover:bg-raised">
                          <input
                            type="checkbox"
                            checked={!excluded.has(c.id)}
                            onChange={() => toggleCard(c.id)}
                          />
                          <span className="min-w-0 flex-1 truncate text-ui-sm text-primary">
                            {c.frontText || c.id.slice(0, 8)}
                          </span>
                          <span className="shrink-0 text-ui-xs text-tertiary">
                            {c.confidence ?? t('filters.unset')}
                          </span>
                        </label>
                      </li>
                    ))
                )}
              </ul>
            </section>

            {error && <p className="mt-4 text-ui-sm text-danger">{error}</p>}
            <div className="sticky bottom-0 mt-6 flex justify-end gap-2 border-t border-subtle bg-base py-4">
              <Button variant="secondary" onClick={() => router.push(`/app/decks/${deckId}`)}>
                {t('backToDeck')}
              </Button>
              <Button variant="primary" onClick={handleStart} disabled={visibleCards.length === 0}>
                {t('start')}
              </Button>
            </div>
          </>
        )}
      </div>
    );
  }

  if (stage === 'complete') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-6">
        <h1 className="text-ui-lg font-semibold text-primary">{t('sessionComplete.title')}</h1>
        <p className="text-ui-base text-secondary">{t('sessionComplete.practiced', { count: practicedCount })}</p>
        <p className="text-ui-sm text-tertiary">{t('sessionComplete.untouched')}</p>
        {streak ? (
          <p className="text-ui-sm text-tertiary">
            {t('sessionComplete.streak', { current: streak.current, longest: streak.longest })}
          </p>
        ) : null}
        <Button variant="primary" onClick={() => router.push(`/app/decks/${deckId}`)}>
          {t('sessionComplete.done')}
        </Button>
      </div>
    );
  }

  const current = queue[0];
  if (!current) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6">
        <p className="text-ui-base text-secondary">{t('noMatch')}</p>
        <Button variant="primary" onClick={() => router.push(`/app/decks/${deckId}`)}>
          {t('backToDeck')}
        </Button>
      </div>
    );
  }

  const counter = endless
    ? t('sessionComplete.practiced', { count: practicedCount })
    : `${totalCount - queue.length + 1} / ${totalCount}`;

  return (
    <div className="flex min-h-dvh flex-col">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-warning bg-raised px-4 py-2" role="note">
        <span className="shrink-0 text-ui-sm text-tertiary">{counter}</span>
        <span className="min-w-0 flex-1 truncate text-center text-ui-xs text-secondary">{t('bannerTitle')}</span>
        <Button variant="ghost" size="sm" onClick={handleEnd}>
          {t('end')}
        </Button>
      </div>

      <div className="flex flex-1 items-center justify-center p-4">
        <FlashcardCard
          front={current.frontJson}
          back={current.backJson}
          showingBack={showingBack}
          onReveal={handleReveal}
        />
      </div>

      {/*
        Always rendered: before reveal an invisible placeholder of identical
        height keeps the card fixed instead of shifting up when the button appears.
        Sticky to the viewport bottom so it can never scroll off-screen
        inside the shelled practice page (the app top bar owns part of the dvh).
      */}
      <div className="sticky bottom-0 shrink-0 border-t border-subtle bg-base p-4 pb-safe">
        <div
          className={phase === 'grading' ? undefined : 'invisible'}
          aria-hidden={phase === 'grading' ? undefined : true}
          inert={phase === 'grading' ? undefined : true}
        >
          <Button variant="primary" onClick={handleNext} className="w-full">
            {t('next')}
          </Button>
        </div>
      </div>

      {error && <p className="text-ui-sm text-danger fixed bottom-4">{error}</p>}
    </div>
  );
}
