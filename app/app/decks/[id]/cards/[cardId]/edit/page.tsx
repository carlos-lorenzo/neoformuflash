import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/supabase/session';
import { getDeck } from '@/lib/db/decks';
import { getCard } from '@/lib/db/cards';
import { CardEditor } from '@/components/decks/card-editor';

export default async function EditCardPage({
  params,
}: {
  params: Promise<{ id: string; cardId: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect('/login');

  const { id, cardId } = await params;

  const [deckResult, cardResult] = await Promise.all([
    getDeck(user.id, id),
    getCard(cardId),
  ]);

  if (!deckResult.ok) {
    const t = await getTranslations('decks');
    return <p className="text-ui-base text-danger">{t('error')}</p>;
  }

  const deck = deckResult.value;
  if (!deck || deck.ownerId !== user.id) notFound();
  if (!cardResult.ok || !cardResult.value) notFound();

  const card = cardResult.value;
  if (card.deckId !== deck.id) notFound();

  const t = await getTranslations('decks');

  return (
    <div className="mx-auto w-full max-w-deck px-4 py-8">
      <h1 className="mb-4 text-ui-lg font-semibold text-primary">
        {t('cardEditor.editTitle')}
      </h1>
      <CardEditor deckId={deck.id} card={card} />
    </div>
  );
}
