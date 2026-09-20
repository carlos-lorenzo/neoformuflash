/*
 * Review session, course-independent.
 *
 * Course-scoped decks keep their /app/courses/[id]/review/[deckId] URL, but
 * decks outside a course (nullable course_id) had no study URL at all — the
 * deck page linked to /app/courses/null/... (404) and the dashboard fell back
 * to the deck page. This route studies any visible deck by id so every deck
 * is studyable regardless of course membership.
 *
 * Lives in the (review) route group like its course-scoped sibling, so the
 * session stays a chrome-free focused surface. The group is transparent to
 * the URL: the path is /app/decks/[id]/study.
 */

import { notFound, redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getSessionUser } from '@/lib/supabase/session';
import { getDeck } from '@/lib/db/decks';
import { ReviewSession } from '@/components/review/review-session';

export default async function DeckStudyPage({
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

  const t = await getTranslations('review');

  return (
    <div className="min-h-screen">
      <h1 className="sr-only">{t('sessionTitle', { deck: deck.title })}</h1>
      <ReviewSession deckId={id} isOwner={deck.ownerId === user.id} />
    </div>
  );
}
