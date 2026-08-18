import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/supabase/session';
import { getCourseForUser } from '@/lib/db/courses';
import { listCourseDecks } from '@/lib/db/decks';
import { listCourseNotes } from '@/lib/db/notes';
import { CourseDetail } from '@/components/courses/course-detail';
import { CourseDetailClient } from '@/components/courses/course-detail-client';

export default async function CoursePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) redirect('/login');

  const { id } = await params;
  const t = await getTranslations('courses');
  const [courseResult, decksResult, notesResult] = await Promise.all([
    getCourseForUser(user.id, id),
    listCourseDecks(id, user.id),
    listCourseNotes(id),
  ]);

  if (!courseResult.ok || !decksResult.ok || !notesResult.ok) {
    return <p className="text-ui-base text-danger">{t('error')}</p>;
  }
  if (!courseResult.value) {
    return <p className="text-ui-base text-secondary">{t('notFound')}</p>;
  }

  const course = courseResult.value;
  // Only show decks/notes if user owns or is subscribed to the course
  if (!course.isOwner && !course.isSubscribed) {
    return <p className="text-ui-base text-secondary">{t('notFound')}</p>;
  }

  return (
    <CourseDetailClient course={course} isOwner={course.isOwner}>
      <CourseDetail
        course={course}
        decks={decksResult.value}
        notes={notesResult.value}
        isOwner={course.isOwner}
        isSubscribed={course.isSubscribed}
      />
    </CourseDetailClient>
  );
}
