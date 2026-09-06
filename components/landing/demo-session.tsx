// Client: the interactive sample session on the landing page.
//
// A self-contained review loop — reveal a card, grade it, move on — over the
// five hand-authored demo flashcards. Nothing touches the server and nothing
// is saved; it exists to make the product's core motion tangible before a
// sign-up. State lives entirely in this component.
//
// Keyboard: Space/Enter reveals (on the card itself), 1–4 grades once the back
// is showing. Keys only register while focus is inside the demo, so the
// header's controls are never hijacked.

'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { CtaLink } from '@/components/landing/cta-link';
import { DemoCard } from '@/components/landing/demo-card';
import { DemoGradingRow, type Rating } from '@/components/landing/demo-grading-row';
import { DEMO_CARDS } from '@/components/landing/demo-deck';

const RATINGS: Rating[] = ['again', 'hard', 'good', 'easy'];

const PREVIEWS: Record<Rating, string> = {
  again: '1m',
  hard: '10m',
  good: '1d',
  easy: '4d',
};

export function DemoSession() {
  const t = useTranslations('landing');
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<'front' | 'grading' | 'complete'>('front');

  const cardRef = useRef<HTMLDivElement>(null);
  const gradeRowRef = useRef<HTMLDivElement>(null);
  const initRef = useRef(false);
  const prevPhaseRef = useRef(phase);

  const total = DEMO_CARDS.length;
  const card = DEMO_CARDS[index]!;

  /*
   * Keep focus inside the demo through the whole loop. Reveal hands focus to
   * the first grade button; a grade returns it to the new card's front — so
   * Space and 1–4 keep working without a mouse and the shortcut hint never
   * lies. The initial render leaves focus alone (the page should open at the
   * top, not jump into the demo).
   */
  useEffect(() => {
    if (!initRef.current) {
      initRef.current = true;
      prevPhaseRef.current = phase;
      return;
    }
    const prev = prevPhaseRef.current;
    if (phase === 'grading' && prev === 'front') {
      gradeRowRef.current?.querySelector('button')?.focus();
    } else if (phase === 'front' && prev !== 'front') {
      cardRef.current?.focus();
    }
    prevPhaseRef.current = phase;
  }, [phase]);

  const reveal = () => {
    setPhase((p) => (p === 'front' ? 'grading' : p));
  };

  const grade = (_rating: Rating) => {
    if (phase !== 'grading') return;
    if (index >= total - 1) {
      setPhase('complete');
    } else {
      setIndex((i) => i + 1);
      setPhase('front');
    }
  };

  const restart = () => {
    setIndex(0);
    setPhase('front');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const el = e.target as HTMLElement;
    if (el.closest('input, textarea, select, [contenteditable="true"]')) return;
    if (phase !== 'grading') return;
    const digit = Number(e.key);
    if (digit >= 1 && digit <= RATINGS.length) {
      const rating = RATINGS[digit - 1];
      if (rating) grade(rating);
    }
  };

  return (
    <div
      data-demo
      onKeyDown={handleKeyDown}
      className="flex w-full flex-col gap-4"
    >
      {phase === 'complete' ? (
        <div className="flex flex-col items-center justify-center gap-4 rounded-lg border border-subtle bg-raised px-6 py-12 text-center">
          <h2 className="text-ui-lg font-semibold text-primary">{t('demo.completeTitle')}</h2>
          <p className="max-w-measure text-ui-sm text-secondary">
            {t('demo.completeBody', { count: total })}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <CtaLink href="/signup">{t('startFree')}</CtaLink>
            <CtaLink href="/login" variant="secondary">
              {t('signIn')}
            </CtaLink>
            <button
              type="button"
              onClick={restart}
              className="inline-flex h-11 items-center justify-center rounded-md px-3 text-ui-base font-medium text-secondary transition-colors duration-instant ease-out hover:bg-raised hover:text-primary"
            >
              {t('demo.runAgain')}
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between gap-4">
            <p className="text-ui-xs font-medium uppercase tracking-eyebrow text-tertiary">
              {t('demo.eyebrow')}
            </p>
            <p className="text-ui-sm font-mono tabular-nums text-tertiary">
              {index + 1} / {total}
            </p>
          </div>

          <p className="text-ui-lg font-semibold text-primary">{t('demo.deck')}</p>

          <DemoCard
            ref={cardRef}
            front={card.front}
            back={card.back}
            showingBack={phase === 'grading'}
            revealLabel={t('demo.revealHint')}
            hint={t('demo.revealHint')}
            onReveal={reveal}
          />

          {phase === 'grading' ? (
            <div ref={gradeRowRef}>
              <DemoGradingRow
                labels={{
                  again: t('demo.again'),
                  hard: t('demo.hard'),
                  good: t('demo.good'),
                  easy: t('demo.easy'),
                }}
                previews={PREVIEWS}
                ariaLabel={t('demo.gradeLabel')}
                shortcutHint={t('demo.shortcutHint')}
                onGrade={grade}
              />
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
