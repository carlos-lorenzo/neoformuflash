// Server Component: deck detail shell — title, Study, settings (owner only),
// and the card list.

import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import type { DeckRow } from '@/lib/db/decks';
import type { CardSummary } from '@/lib/db/cards';
import { CardList } from './card-list';
import { DeckForm } from './deck-form';
import { DeleteDeckButton } from './delete-deck-button';

export async function DeckDetail({
  deck,
  canEdit,
  cards,
}: {
  deck: DeckRow;
  canEdit: boolean;
  cards: CardSummary[];
}) {
  const t = await getTranslations('decks');

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="truncate text-ui-lg font-semibold text-primary">{deck.title}</h1>
          <p className="text-ui-sm text-secondary">
            {t('detail.cardCount', { count: cards.length })}
          </p>
        </div>
        <Link
          href={`/review/${deck.id}`}
          className="shrink-0 rounded-sm bg-accent px-4 py-2 text-ui-base font-medium text-on-accent hover:bg-accent-hover"
        >
          {t('detail.study')}
        </Link>
      </div>

      {canEdit ? (
        <section className="mb-8 rounded-md border border-subtle p-4">
          <h2 className="mb-4 text-ui-sm font-semibold text-secondary">
            {t('detail.settings')}
          </h2>
          <DeckForm
            deck={{
              id: deck.id,
              title: deck.title,
              visibility: deck.visibility,
              desiredRetention: deck.desiredRetention,
              newCardsPerDay: deck.newCardsPerDay,
            }}
          />
          <div className="mt-4 border-t border-subtle pt-4">
            <DeleteDeckButton deckId={deck.id} />
          </div>
        </section>
      ) : null}

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-ui-base font-semibold text-primary">{t('detail.cards')}</h2>
          {canEdit ? (
            <Link
              href={`/app/decks/${deck.id}/cards/new`}
              className="rounded-sm border border-subtle px-3 py-2 text-ui-sm font-medium text-secondary hover:border-strong"
            >
              {t('detail.addCard')}
            </Link>
          ) : null}
        </div>
        <CardList deckId={deck.id} canEdit={canEdit} cards={cards} />
      </section>
    </div>
  );
}
