import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/supabase/session';
import { listCoursesWithSubscription } from '@/lib/db/courses';
import { CourseList } from '@/components/courses/course-list';

export default async function CoursesPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');

  const t = await getTranslations('courses');
  const result = await listCoursesWithSubscription(user.id);

  if (!result.ok) {
    return <p className="text-ui-base text-danger">{t('error')}</p>;
  }

  return <CourseList courses={result.value} />;
}
