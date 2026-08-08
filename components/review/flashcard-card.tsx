// Client: flashcard with 200ms Y-rotation flip (instant under prefers-reduced-motion).
// Overflow scales font down one step — never scrolls.

'use client';

import { useTranslations } from 'next-intl';
import { NoteDocView } from '@/components/note/note-doc-view';
import type { NoteDoc } from '@neoformuflash/contracts';
import { cn } from '@/lib/cn';

export type FlashcardCardProps = {
  front: NoteDoc;
  back: NoteDoc;
  revealed: boolean;
  onReveal: () => void;
};

export function FlashcardCard({ front, back, revealed, onReveal }: FlashcardCardProps) {
  const t = useTranslations('review');
  const showHint = !revealed;

  return (
    <div
      className={cn(
        'relative w-full aspect-[4/3] max-w-[640px] mx-auto perspective-1000',
        'border border-subtle rounded-lg bg-raised',
        revealed && 'flipped'
      )}
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
      <div className={cn(
        'absolute inset-0 w-full h-full transition-transform duration-base ease-in-out',
        'transform-style-3d backface-hidden',
        revealed && 'rotate-y-180',
      )}>
        {/* Front */}
        <div className="absolute inset-0 w-full h-full backface-hidden flex flex-col items-center justify-center p-6 text-center">
          <div className="w-full h-full flex flex-col items-center justify-center overflow-hidden">
            <NoteDocView doc={front} />
          </div>
          {showHint && (
            <div className="absolute bottom-4 text-ui-sm text-tertiary animate-pulse">
              {t('shortcutHint')}
            </div>
          )}
        </div>

        {/* Back */}
        <div className={cn(
          'absolute inset-0 w-full h-full backface-hidden flex flex-col items-center justify-center p-6 text-center',
          'rotate-y-180',
          revealed && 'rotate-y-0',
        )}>
          <div className="w-full h-full flex flex-col items-center justify-center overflow-hidden">
            <NoteDocView doc={back} />
          </div>
        </div>
      </div>
    </div>
  );
}