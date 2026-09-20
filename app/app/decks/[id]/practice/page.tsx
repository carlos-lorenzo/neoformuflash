import { notFound, redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getSessionUser } from '@/lib/supabase/session';
import { getDeck } from '@/lib/db/decks';
import { listCards } from '@/lib/db/cards';
import { PracticeSession } from '@/components/review/practice-session';

/*
 * Practice setup + session (shelled page).
 *
 * Unlike the chrome-free FSRS review routes, practice keeps the app chrome:
 * the pre-session filter menu (confidence + per-card include/exclude) is a
 * browsing surface, and the in-session banner must stay visible so the
 * "schedule untouched" distinction is never one navigation away.
 */
export default async function DeckPracticePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect('/login');

  const { id } = await params;
  const [deckResult, cardsResult] = await Promise.all([getDeck(user.id, id), listCards(id)]);

  if (!deckResult.ok) {
    const t = await getTranslations('decks');
    return <p className="text-ui-base text-danger">{t('error')}</p>;
  }
  const deck = deckResult.value;
  if (!deck) notFound();

  const cards = cardsResult.ok ? cardsResult.value : [];

  return (
    <PracticeSession
      deckId={id}
      deckTitle={deck.title}
      initialCards={cards.map((c) => ({
        id: c.id,
        frontText: c.frontText,
        confidence: c.confidence as 'again' | 'hard' | 'good' | 'easy' | null,
      }))}
    />
  );
}
