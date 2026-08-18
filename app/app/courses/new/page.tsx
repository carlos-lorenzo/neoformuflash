import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/supabase/session';
import { CourseForm } from '@/components/courses/course-form';

export default async function NewCoursePage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');

  const t = await getTranslations('courses');

  return (
    <div className="mx-auto w-full max-w-measure px-4 py-8">
      <h1 className="mb-4 text-ui-lg font-semibold text-primary">{t('createCourse')}</h1>
      <CourseForm />
    </div>
  );
}
