// Client: flashcard with 200ms Y-axis rotation (instant under prefers-reduced-motion).

'use client';

import { useTranslations } from 'next-intl';
import { NoteDocView } from '@/components/note/note-doc-view';
import type { NoteDoc } from '@neoformuflash/contracts';

export type FlashcardCardProps = {
  front: NoteDoc;
  back: NoteDoc;
  revealed: boolean;
  onReveal: () => void;
};

export function FlashcardCard({ front, back, revealed, onReveal }: FlashcardCardProps) {
  const t = useTranslations('review');

  return (
    <div
      className="flip-container relative w-full aspect-[4/3] max-w-2xl mx-auto rounded-lg border border-subtle bg-raised"
      onClick={revealed ? undefined : onReveal}
      role="button"
      tabIndex={revealed ? undefined : 0}
      onKeyDown={(e) => {
        if (!revealed && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onReveal();
        }
      }}
    >
      <div className={revealed ? 'flip-inner flipped' : 'flip-inner'}>
        {/* Front */}
        <div className="flip-face flip-front absolute inset-0 flex flex-col items-center justify-center p-6 text-center">
          <div className="w-full h-full flex flex-col items-center justify-center overflow-hidden">
            <NoteDocView doc={front} />
          </div>
          {!revealed && (
            <div className="absolute bottom-4 text-ui-sm text-tertiary animate-pulse">
              {t('shortcutHint')}
            </div>
          )}
        </div>

        {/* Back */}
        <div className="flip-face flip-back absolute inset-0 flex flex-col items-center justify-center p-6 text-center">
          <div className="w-full h-full flex flex-col items-center justify-center overflow-hidden">
            <NoteDocView doc={back} />
          </div>
        </div>
      </div>
    </div>
  );
}
