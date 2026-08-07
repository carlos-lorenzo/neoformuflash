// Client: sort control + list rendering for a deck's cards.

'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useActiveScope } from '@/lib/shortcuts/use-scope';
import { cn } from '@/lib/cn';
import type { CardSummary } from '@/lib/db/cards';

type SortKey = 'position' | 'confidence_asc' | 'confidence_desc';

const CONFIDENCE_ORDER: Record<string, number> = {
  again: 0,
  hard: 1,
  good: 2,
  easy: 3,
};

export function CardListClient({
  deckId,
  canEdit,
  cards,
  initialSort,
}: {
  deckId: string;
  canEdit: boolean;
  cards: CardSummary[];
  initialSort: SortKey;
}) {
  const t = useTranslations('decks');
  const [sort, setSort] = useState<SortKey>(initialSort);

  useActiveScope('list');

  const sorted = useMemo(() => {
    const copy = [...cards];
    const confValue = (c: CardSummary) =>
      c.confidence ? (CONFIDENCE_ORDER[c.confidence] ?? -1) : -1;
    switch (sort) {
      case 'confidence_asc':
        return copy.sort(
          (a, b) => confValue(a) - confValue(b) || a.position - b.position,
        );
      case 'confidence_desc':
        return copy.sort(
          (a, b) => confValue(b) - confValue(a) || a.position - b.position,
        );
      default:
        return copy.sort((a, b) => a.position - b.position);
    }
  }, [cards, sort]);

  const sortButton = (key: SortKey, label: string) => (
    <button
      type="button"
      onClick={() => setSort(key)}
      className={cn(
        'rounded-sm px-2 py-1 text-ui-xs tracking-ui',
        sort === key ? 'bg-inset text-primary' : 'text-secondary hover:text-primary'
      )}
    >
      {label}
    </button>
  );

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        {sortButton('position', t('cardList.sortPosition'))}
        {sortButton('confidence_asc', t('cardList.sortConfidenceAsc'))}
        {sortButton('confidence_desc', t('cardList.sortConfidenceDesc'))}
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
                {card.frontText || '—'}
              </span>
              {card.confidence ? (
                <span
                  className={cn(
                    'shrink-0 rounded-sm border px-2 py-1 text-ui-xs tracking-ui',
                    confidenceBadgeClass(card.confidence)
                  )}
                >
                  {t(`grade.${card.confidence}`)}
                </span>
              ) : null}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function confidenceBadgeClass(confidence: string): string {
  switch (confidence) {
    case 'again':
      return 'border-danger/40 text-danger';
    case 'hard':
      return 'border-warning/40 text-warning';
    case 'easy':
      return 'border-success/40 text-success';
    default:
      return 'border-subtle text-secondary';
  }
}
