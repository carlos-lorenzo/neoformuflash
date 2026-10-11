import { notFound, redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import type { Route } from 'next';
import { getSessionUser } from '@/lib/supabase/session';
import { getCourseForUser } from '@/lib/db/courses';
import { listCourseDecks } from '@/lib/db/decks';
import { listCards } from '@/lib/db/cards';
import { PracticeSession } from '@/components/review/practice-session';

/*
 * Course practice setup + session (shelled page, schedule untouched).
 *
 * URL: /app/courses/[id]/practice[?decks=<id>,<id>]
 *   - no ?decks → whole course
 *   - ?decks=a,b → subset; every id must belong to this course, else 404
 */
export default async function CoursePracticePage({
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
    if (selected.length !== wanted.size) notFound();
  }
  if (selected.length === 0) notFound();

  const cardsResults = await Promise.all(selected.map((d) => listCards(d.id)));
  const initialCards = cardsResults.flatMap((r) =>
    r.ok
      ? r.value.map((c) => ({
          id: c.id,
          frontText: c.frontText,
          confidence: c.confidence as 'again' | 'hard' | 'good' | 'easy' | null,
        }))
      : [],
  );

  const deckIds = selected.map((d) => d.id);

  return (
    <PracticeSession
      deckId={deckIds[0]!}
      deckIds={deckIds}
      backHref={`/app` as Route}
      deckTitle={course.name}
      initialCards={initialCards}
    />
  );
}
