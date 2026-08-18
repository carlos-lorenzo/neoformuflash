// Server Component: renders a deck's cards, sortable by position or confidence.

import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import type { CardSummary } from '@/lib/db/cards';
import { CardListClient } from './card-list-client';

export async function CardList({
  deckId,
  canEdit,
  cards,
  initialSort = 'position',
}: {
  deckId: string;
  canEdit: boolean;
  cards: CardSummary[];
  initialSort?: 'position' | 'confidence_asc' | 'confidence_desc';
}) {
  const t = await getTranslations('decks');

  if (cards.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 py-12 text-center">
        <p className="text-ui-lg font-semibold text-primary">{t('detail.emptyCards')}</p>
        <p className="max-w-prose text-ui-base text-secondary">{t('detail.emptyCardsBody')}</p>
        {canEdit ? (
          <Link
            href={`/app/decks/${deckId}/cards/new`}
            className="rounded-sm bg-accent px-4 py-2 text-ui-base font-medium text-on-accent hover:bg-accent-hover"
          >
            {t('detail.addCard')}
          </Link>
        ) : null}
      </div>
    );
  }

  return (
    <div>
      <CardListClient
        deckId={deckId}
        canEdit={canEdit}
        cards={cards}
        initialSort={initialSort}
      />
    </div>
  );
}
