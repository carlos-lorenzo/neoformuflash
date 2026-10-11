/*
 * Course study session (whole course or a subset of its decks).
 *
 * URL: /app/courses/[id]/study[?decks=<id>,<id>]
 *   - no ?decks → whole course (every deck visible to the caller)
 *   - ?decks=a,b → subset; every id must belong to this course, else 404
 *
 * Lives in the (review) route group so it escapes the AppShell layout, same
 * as the single-deck review routes. Back/Done/Leave returns to the course.
 */

import { notFound, redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import type { Route } from 'next';
import { getSessionUser } from '@/lib/supabase/session';
import { getCourseForUser } from '@/lib/db/courses';
import { listCourseDecks } from '@/lib/db/decks';
import { ReviewSession } from '@/components/review/review-session';

export default async function CourseStudyPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ decks?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect('/login');

  const { id: courseId } = await params;
  const { decks: decksParam } = await searchParams;

  const [courseResult, decksResult] = await Promise.all([
    getCourseForUser(user.id, courseId),
    listCourseDecks(courseId, user.id),
  ]);

  if (!courseResult.ok || !decksResult.ok) {
    const t = await getTranslations('courses');
    return <p className="text-ui-base text-danger">{t('error')}</p>;
  }
  const course = courseResult.value;
  if (!course) notFound();
  if (!course.isOwner && !course.isSubscribed) notFound();

  const allDecks = decksResult.value;
  let selected = allDecks;
  if (decksParam) {
    const wanted = new Set(decksParam.split(',').map((s) => s.trim()).filter(Boolean));
    if (wanted.size === 0) notFound();
    selected = allDecks.filter((d) => wanted.has(d.id));
    // Every requested id must exist in this course — a deck from another
    // course (or a typo) is a 404, not a silent partial session.
    if (selected.length !== wanted.size) notFound();
  }
  if (selected.length === 0) notFound();

  const t = await getTranslations('review');
  const deckIds = selected.map((d) => d.id);

  return (
    <div className="min-h-screen">
      <h1 className="sr-only">{t('sessionTitle', { deck: course.name })}</h1>
      <ReviewSession
        deckId={deckIds[0]!}
        deckIds={deckIds}
        backHref={`/app` as Route}
        isOwner={course.isOwner}
      />
    </div>
  );
}
