// Server Component: deck detail shell — title, Study, settings (owner only),
// and the card list.

import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import type { Route } from 'next';
import type { DeckRow } from '@/lib/db/decks';
import type { CardSummary } from '@/lib/db/cards';
import { CardList } from './card-list';
import { MultiCardEditor } from './multi-card-editor';
import { DeckForm } from './deck-form';
import { DeleteDeckButton } from './delete-deck-button';

export async function DeckDetail({
  deck,
  canEdit,
  cards,
  courseName,
}: {
  deck: DeckRow;
  canEdit: boolean;
  cards: CardSummary[];
  courseName?: string | null;
}) {
  const t = await getTranslations('decks');

  /*
   * The owner gets the editor canvas width; a subscriber gets the reading
   * measure. §6: "a content column capped at 68ch for reading and full-bleed
   * for the editor canvas" — the card grid is the latter.
   */
  const width = canEdit ? 'max-w-deck' : 'max-w-measure';

  return (
    <div className={`mx-auto w-full ${width} px-4 py-8`}>
      {courseName ? (
        <div className="mb-4 flex items-center gap-1 text-ui-sm text-secondary">
          <Link
            href={`/app/courses/${deck.courseId}`}
            className="hover:underline"
          >
            {courseName}
          </Link>
          <span aria-hidden="true">/</span>
        </div>
      ) : null}

      <div className="mb-6 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="truncate text-ui-lg font-semibold text-primary">{deck.title}</h1>
          <p className="text-ui-sm text-secondary">
            {t('detail.cardCount', { count: cards.length })}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Link
            href={`/app/decks/${deck.id}/preview` as Route}
            className="rounded-sm border border-subtle px-4 py-2 text-ui-base font-medium text-secondary hover:text-primary"
          >
            {t('detail.preview')}
          </Link>
          <Link
            href={`/app/courses/${deck.courseId}/review/${deck.id}`}
            className="rounded-sm bg-accent px-4 py-2 text-ui-base font-medium text-on-accent hover:bg-accent-hover"
          >
            {t('detail.study')}
          </Link>
        </div>
      </div>

      {canEdit ? (
        <section className="mb-8">
          <details className="rounded-md border border-subtle">
            <summary className="flex items-center justify-between cursor-pointer select-none p-4">
              <span className="text-ui-sm font-semibold text-secondary">{t('detail.settings')}</span>
              <span className="text-ui-xs text-tertiary">›</span>
            </summary>
            <div className="p-4 border-t border-subtle">
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
            </div>
          </details>
        </section>
      ) : null}

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-ui-base font-semibold text-primary">{t('detail.cards')}</h2>
        </div>

        {/*
          The owner edits every card in place; a subscriber gets the read-only
          list. The per-card routes (/cards/new, /cards/[id]/edit) still exist
          and still work as deep links — nothing links to them any more.
        */}
        {canEdit ? (
          <MultiCardEditor
            deckId={deck.id}
            initialCards={cards.map((card) => ({
              id: card.id,
              frontJson: card.frontJson,
              backJson: card.backJson,
            }))}
          />
        ) : (
          <CardList deckId={deck.id} canEdit={canEdit} cards={cards} />
        )}
      </section>
    </div>
  );
}