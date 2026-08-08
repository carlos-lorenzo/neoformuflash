import { notFound, redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getSessionUser } from '@/lib/supabase/session';
import { getDeck } from '@/lib/db/decks';
import { ReviewSession } from '@/components/review/review-session';

export default async function ReviewPage({
  params,
}: {
  params: Promise<{ deckId: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect('/login');

  const { deckId } = await params;
  const deckResult = await getDeck(user.id, deckId);

  if (!deckResult.ok) {
    const t = await getTranslations('decks');
    return <p className="text-ui-base text-danger">{t('error')}</p>;
  }

  const deck = deckResult.value;
  if (!deck) notFound();

  const t = await getTranslations('review');

  return (
    <div className="min-h-screen">
      <h1 className="sr-only">{t('sessionTitle', { deck: deck.title })}</h1>
      <ReviewSession deckId={deckId} isOwner={deck.ownerId === user.id} />
    </div>
  );
}