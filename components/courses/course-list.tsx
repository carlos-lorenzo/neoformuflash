// Server Component: renders the user's course list or an empty-state invitation.
//
// Follows the notes/decks list discipline: the create action must be reachable
// in BOTH states. Courses are the primary nav hierarchy (phase-03b H).

import { getTranslations } from 'next-intl/server';
import type { CourseSummary } from '@/lib/db/courses';
import { CourseListClient } from './course-list-row';
import { CreateCourseButton } from './create-course-button';

type CourseWithSubscription = CourseSummary & { isOwner: boolean; isSubscribed: boolean };

export async function CourseList({ courses }: { courses: CourseWithSubscription[] }) {
  const t = await getTranslations('courses');

  if (courses.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 py-16 text-center">
        <p className="text-ui-lg font-semibold text-primary">{t('emptyTitle')}</p>
        <p className="max-w-prose text-ui-base text-secondary">{t('emptyBody')}</p>
        <CreateCourseButton />
        <p className="text-ui-xs tracking-ui text-tertiary">{t('shortcutHint')}</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h1 className="text-ui-lg font-semibold text-primary">{t('listTitle')}</h1>
        <CreateCourseButton />
      </div>
      <CourseListClient courses={courses} />
    </div>
  );
}
