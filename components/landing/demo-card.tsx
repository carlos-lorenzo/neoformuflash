// Client: the landing demo's flashcard — the product's review card, minus the
// app-only affordances. Same 200ms Y-axis flip, same tokens, same surface.
//
// Unlike the review card (absolute faces inside a viewport-filling container)
// this stage is content-sized: both faces share one grid cell and the stage
// grows to the taller of the two. CSS in styles/globals.css (.landing-flip).
//
// The ref points at the interactive stage so the parent can return focus to it
// after each grade (keeping the Space/1–4 loop usable without a mouse). The
// face that is not showing is hidden from assistive tech, so a screen reader
// never hears the answer before the reveal.

'use client';

import { forwardRef } from 'react';
import { cn } from '@/lib/cn';
import { NoteDocView } from '@/components/note/note-doc-view';
import type { NoteDoc } from '@neoformuflash/contracts';

export type DemoCardProps = {
  front: NoteDoc;
  back: NoteDoc;
  showingBack: boolean;
  /** Accessible name for the reveal control. */
  revealLabel: string;
  /** Short hint shown at the bottom of the front face. */
  hint: string;
  onReveal: () => void;
};

export const DemoCard = forwardRef<HTMLDivElement, DemoCardProps>(function DemoCard(
  { front, back, showingBack, revealLabel, hint, onReveal },
  ref
) {
  return (
    <div className="mx-auto w-full max-w-review">
      <div
        ref={ref}
        className={cn('landing-flip', showingBack && 'flipped')}
        onClick={showingBack ? undefined : onReveal}
        role={showingBack ? undefined : 'button'}
        aria-label={showingBack ? undefined : revealLabel}
        tabIndex={showingBack ? undefined : 0}
        onKeyDown={(e) => {
          if (!showingBack && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            e.stopPropagation();
            onReveal();
          }
        }}
      >
        {/* Front */}
        <div
          aria-hidden={showingBack}
          className="landing-face flex flex-col rounded-lg border border-subtle bg-raised px-6 py-6 text-center sm:px-12"
        >
          <div className="flex flex-1 items-center justify-center">
            <NoteDocView doc={front} />
          </div>
          {!showingBack ? (
            <p className="pt-6 text-ui-sm text-secondary">{hint}</p>
          ) : null}
        </div>

        {/* Back */}
        <div
          aria-hidden={!showingBack}
          className="landing-face landing-back flex flex-col rounded-lg border border-subtle bg-raised px-6 py-6 text-center sm:px-12"
        >
          <div className="flex flex-1 items-center justify-center">
            <NoteDocView doc={back} />
          </div>
        </div>
      </div>
    </div>
  );
});
