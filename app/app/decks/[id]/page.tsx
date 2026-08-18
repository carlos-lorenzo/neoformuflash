import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/supabase/session';
import { getDeck } from '@/lib/db/decks';
import { listCards } from '@/lib/db/cards';
import { getCourse } from '@/lib/db/courses';
import { DeckDetail } from '@/components/decks/deck-detail';

export default async function DeckDetailPage({
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

  // Fetch course name for breadcrumb if deck has a course
  let courseName: string | null = null;
  if (deck.courseId) {
    const courseResult = await getCourse(deck.courseId);
    if (courseResult.ok && courseResult.value) {
      courseName = courseResult.value.name;
    }
  }

  return (
    <DeckDetail
      deck={deck}
      canEdit={deck.ownerId === user.id}
      cards={cardsResult.ok ? cardsResult.value : []}
      courseName={courseName}
    />
  );
}