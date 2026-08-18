// Server Component: the dashboard shows the user's courses as the primary workspace.
// Empty state invites creating the first course.

import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/supabase/session';
import { listCourses } from '@/lib/db/courses';
import { listDecks } from '@/lib/db/decks';
import { getProfile } from '@/lib/db/profiles';
import { CourseCard } from '@/components/courses/course-card';
import { CreateCourseButton } from '@/components/courses/create-course-button';
import { EmptyState } from '@/components/ui/empty-state';
import { PublicHandleCard } from '@/components/dashboard/public-handle-card';

export default async function DashboardPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');

  const t = await getTranslations('dashboard');
  const tc = await getTranslations('courses');

  const [coursesResult, decksResult, profileResult] = await Promise.all([
    listCourses(user.id),
    listDecks(user.id),
    getProfile(user.id),
  ]);

  const courses = coursesResult.ok ? coursesResult.value : [];
  const decks = decksResult.ok ? decksResult.value : [];
  const profile = profileResult.ok ? profileResult.value : null;

  // Compute due counts per course
  const dueByCourse = new Map<string, number>();
  for (const deck of decks) {
    if (deck.courseId && deck.dueCount > 0) {
      dueByCourse.set(deck.courseId, (dueByCourse.get(deck.courseId) ?? 0) + deck.dueCount);
    }
  }

  if (courses.length === 0) {
    return (
      <div className="flex flex-col gap-6 py-2">
        {profile && <PublicHandleCard handle={profile.handle} />}
        <EmptyState
          title={t('emptyTitle')}
          body={t('emptyBody')}
          action={<CreateCourseButton />}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 py-2">
      {profile && <PublicHandleCard handle={profile.handle} />}
      <h1 className="text-ui-xl font-semibold text-primary">{tc('listTitle')}</h1>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {courses.map((course) => (
          <CourseCard
            key={course.id}
            course={course}
            dueCount={dueByCourse.get(course.id) ?? 0}
          />
        ))}
      </div>
    </div>
  );
}