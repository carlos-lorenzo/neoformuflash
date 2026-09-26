// Client: flashcard with 200ms Y-axis rotation (instant under prefers-reduced-motion).

'use client';

import { useTranslations } from 'next-intl';
import { NoteDocView } from '@/components/note/note-doc-view';
import type { NoteDoc } from '@neoformuflash/contracts';

// Ensure KaTeX styles are loaded for flashcard math rendering
import 'katex/dist/katex.min.css';

export type FlashcardCardProps = {
  front: NoteDoc;
  back: NoteDoc;
  showingBack: boolean;
  onReveal: () => void;
  /**
   * Hint shown at the bottom of the front face. Defaults to the review
   * shortcut hint — practice sessions must pass their own, since 1-4/e/u
   * do nothing there (Space/Enter/Esc only).
   */
  hint?: string;
};

export function FlashcardCard({ front, back, showingBack, onReveal, hint }: FlashcardCardProps) {
  const t = useTranslations('review');

  return (
    <div
      className="flip-container relative w-full h-full max-w-review laptop:max-w-review-wide mx-auto min-h-editor rounded-lg border border-subtle bg-raised"
      onClick={showingBack ? undefined : onReveal}
      role="button"
      tabIndex={showingBack ? undefined : 0}
      onKeyDown={(e) => {
        if (!showingBack && e.key === 'Enter') {
          e.preventDefault();
          e.stopPropagation();
          onReveal();
        }
      }}
    >
      <div className={showingBack ? 'flip-inner flipped' : 'flip-inner'} style={{ height: '100%' }}>
        {/* Front */}
        <div className="flip-face absolute inset-0 flex min-h-0 flex-col items-stretch justify-center p-6 text-center">
          <div className="flex h-full min-h-0 w-full flex-1 flex-col items-stretch justify-center overflow-auto">
            <div className="mx-auto w-full max-w-measure">
              <NoteDocView doc={front} />
            </div>
          </div>
          {!showingBack && (
            <div className="absolute bottom-4 text-ui-sm text-secondary animate-pulse">
              {hint ?? t('shortcutHint')}
            </div>
          )}
        </div>

        {/* Back */}
        <div className="flip-face flip-back absolute inset-0 flex min-h-0 flex-col items-stretch justify-center p-6 text-center">
          <div className="flex h-full min-h-0 w-full flex-1 flex-col items-stretch justify-center overflow-auto">
            <div className="mx-auto w-full max-w-measure">
              <NoteDocView doc={back} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
