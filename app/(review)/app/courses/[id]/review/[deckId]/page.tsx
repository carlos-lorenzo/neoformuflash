/*
 * Review session, course-scoped (phase-03c).
 *
 * The URL carries both ids, so the deck's membership in the course is a claim
 * the client makes — verified below. Without that check, /app/courses/<any
 * course I own>/review/<some other deck> would render a session under a course
 * the deck was never in, and the "back to course" links would send the user
 * somewhere the deck does not live (spec risk 4).
 *
 * This page lives in the (review) route group rather than under app/app/ so it
 * escapes the AppShell layout: the review screen is a single-purpose focused
 * surface with no sidebar or header. The route group is transparent to the URL,
 * so the path is still /app/courses/[id]/review/[deckId].
 */

import { notFound, redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getSessionUser } from '@/lib/supabase/session';
import { getDeck } from '@/lib/db/decks';
import { ReviewSession } from '@/components/review/review-session';

export default async function ReviewPage({
  params,
}: {
  params: Promise<{ id: string; deckId: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect('/login');

  const { id: courseId, deckId } = await params;
  const deckResult = await getDeck(user.id, deckId);

  if (!deckResult.ok) {
    const t = await getTranslations('decks');
    return <p className="text-ui-base text-danger">{t('error')}</p>;
  }

  const deck = deckResult.value;
  if (!deck) notFound();
  // A deck reached through the wrong course is a 404, not a redirect: the URL
  // asserts a containment that does not hold.
  if (deck.courseId !== courseId) notFound();

  const t = await getTranslations('review');

  return (
    <div className="min-h-screen">
      <h1 className="sr-only">{t('sessionTitle', { deck: deck.title })}</h1>
      <ReviewSession deckId={deckId} isOwner={deck.ownerId === user.id} />
    </div>
  );
}
