import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/supabase/session';
import { getDeck } from '@/lib/db/decks';
import { listCards } from '@/lib/db/cards';
import { NoteDocView } from '@/components/note/note-doc-view';

// Read-only deck preview — renders every card's front and back at the reading
// measure, exactly as a flashcard would (phase-03b E). Anyone who can view the
// deck can preview it; ownership only gates editing.

export default async function DeckPreviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect('/login');

  const { id } = await params;
  const [deckResult, cardsResult] = await Promise.all([
    getDeck(user.id, id),
    listCards(id),
  ]);

  if (!deckResult.ok) {
    const t = await getTranslations('decks');
    return <p className="text-ui-base text-danger">{t('error')}</p>;
  }

  const deck = deckResult.value;
  if (!deck) notFound();

  const t = await getTranslations('decks');
  const cards = cardsResult.ok ? cardsResult.value : [];

  return (
    <div className="mx-auto w-full max-w-measure px-4 py-8">
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-ui-lg font-semibold text-primary">{deck.title}</h1>
        <Link href={`/app/decks/${deck.id}`} className="text-ui-sm text-secondary hover:text-primary">
          {t('preview.backToDeck')}
        </Link>
      </div>

      {cards.length === 0 ? (
        <p className="text-ui-base text-secondary">{t('detail.emptyCards')}</p>
      ) : (
        <ol className="flex flex-col gap-6">
          {cards.map((card, i) => (
            <li key={card.id} className="rounded-lg border border-subtle bg-raised p-6">
              <div className="mb-4 flex items-center justify-between gap-2">
                <span className="text-ui-xs tracking-ui text-tertiary">
                  {t('preview.card', { n: i + 1 })}
                </span>
              </div>
              <div className="flex flex-col gap-6">
                <section>
                  <h2 className="mb-2 text-ui-xs font-medium tracking-ui text-secondary uppercase">
                    {t('cardEditor.front')}
                  </h2>
                  <NoteDocView doc={card.frontJson} />
                </section>
                <section>
                  <h2 className="mb-2 text-ui-xs font-medium tracking-ui text-secondary uppercase">
                    {t('cardEditor.back')}
                  </h2>
                  <NoteDocView doc={card.backJson} />
                </section>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
