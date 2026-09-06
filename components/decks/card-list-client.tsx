// Client: sort control + list rendering for a deck's cards.

'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useActiveScope } from '@/lib/shortcuts/use-scope';
import { cn } from '@/lib/cn';
import type { CardSummary } from '@/lib/db/cards';
import { NoteDocPreview } from '@/components/note/note-doc-preview';

export function CardListClient({
  deckId,
  canEdit,
  cards,
}: {
  deckId: string;
  canEdit: boolean;
  cards: CardSummary[];
}) {
  const t = useTranslations('decks');
  const [showAnswers, setShowAnswers] = useState(false);

  useActiveScope('list');

  const sorted = [...cards].sort((a, b) => a.position - b.position);

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setShowAnswers((v) => !v)}
          aria-pressed={showAnswers}
          className={cn(
            'ml-auto rounded-sm px-2 py-1 text-ui-xs tracking-ui',
            showAnswers ? 'bg-inset text-primary' : 'text-secondary hover:text-primary'
          )}
        >
          {showAnswers ? t('cardList.hideAnswers') : t('cardList.showAnswers')}
        </button>
      </div>

      <ul className="flex flex-col divide-y divide-subtle">
        {sorted.map((card) => (
          <li key={card.id}>
            <Link
              href={canEdit ? `/app/decks/${deckId}/cards/${card.id}/edit` : '#'}
              aria-disabled={!canEdit}
              className={cn(
                'flex items-center justify-between gap-3 px-2 py-3',
                canEdit && 'transition-colors hover:bg-inset'
              )}
            >
              <span className="min-w-0 flex-1 truncate text-ui-base text-primary">
                <NoteDocPreview doc={card.frontJson} />
              </span>
              {showAnswers ? (
                <span className="min-w-0 flex-1 truncate text-ui-sm text-secondary">
                  <NoteDocPreview doc={card.backJson} />
                </span>
              ) : null}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
