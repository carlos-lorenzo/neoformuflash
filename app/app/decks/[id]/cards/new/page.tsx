import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/supabase/session';
import { getDeck } from '@/lib/db/decks';
import { CardEditor } from '@/components/decks/card-editor';

export default async function NewCardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect('/login');

  const { id } = await params;
  const deckResult = await getDeck(user.id, id);
  if (!deckResult.ok) {
    const t = await getTranslations('decks');
    return <p className="text-ui-base text-danger">{t('error')}</p>;
  }

  const deck = deckResult.value;
  if (!deck) notFound();
  if (deck.ownerId !== user.id) notFound();

  const t = await getTranslations('decks');

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <h1 className="mb-4 text-ui-lg font-semibold text-primary">
        {t('detail.addCard')}
      </h1>
      <CardEditor deckId={deck.id} />
    </div>
  );
}
