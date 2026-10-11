// Server Component: the dashboard is the merged home + courses surface.
//
// Top to bottom: your own due decks grouped by course and your own courses,
// then one tab per subscribed creator, a slim stats band, then the shareable
// profile link. Courses used to be a second top-level page that re-listed
// this same data; /app/courses now redirects here.

import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { cn } from '@/lib/cn';
import { getSessionUser } from '@/lib/supabase/session';
import { listCoursesWithSubscription } from '@/lib/db/courses';
import { getStreak, listDecks } from '@/lib/db/decks';
import { getOwnerLabels, getProfile } from '@/lib/db/profiles';
import { getRecentDayCounts, getTodayReviewStats } from '@/lib/db/stats';
import { CourseCard } from '@/components/courses/course-card';
import { CreateCourseButton } from '@/components/courses/create-course-button';
import { DashboardStats } from '@/components/dashboard/dashboard-stats';
import { DueDecksList } from '@/components/dashboard/due-decks-list';
import { SubscribedCreators } from '@/components/dashboard/subscribed-creators';
import { EmptyState } from '@/components/ui/empty-state';
import { PublicHandleCard } from '@/components/dashboard/public-handle-card';

export default async function DashboardPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');

  const t = await getTranslations('dashboard');
  const tc = await getTranslations('courses');

  const [coursesResult, decksResult, profileResult, streakResult, todayResult, activityResult] =
    await Promise.all([
      listCoursesWithSubscription(user.id),
      listDecks(user.id),
      getProfile(user.id),
      getStreak(user.id),
      getTodayReviewStats(user.id),
      getRecentDayCounts(user.id, 7),
    ]);

  const courses = coursesResult.ok ? coursesResult.value : [];
  const decks = decksResult.ok ? decksResult.value : [];
  const profile = profileResult.ok ? profileResult.value : null;
  const streak = streakResult.ok ? streakResult.value : null;
  const today = todayResult.ok ? todayResult.value : { reviewedToday: 0, msToday: 0 };
  const activity = activityResult.ok ? activityResult.value : [];

  const ownCourses = courses.filter((c) => c.isOwner);
  const subscribedCourses = courses.filter((c) => c.isSubscribed);
  const ownDecks = decks.filter((d) => !d.isSubscribed);
  const subscribedDecks = decks.filter((d) => d.isSubscribed);

  // Due counts per course (for the cards' pills) and a deck-level view of what
  // is outstanding right now. Subscribed decks are excluded here — they live
  // under their creator's tab instead of masquerading as your own decks.
  const dueByCourse = new Map<string, number>();
  let totalDue = 0;
  for (const deck of decks) {
    totalDue += deck.dueCount;
    if (deck.courseId && deck.dueCount > 0) {
      dueByCourse.set(deck.courseId, (dueByCourse.get(deck.courseId) ?? 0) + deck.dueCount);
    }
  }

  const dueDecks = ownDecks.filter((deck) => deck.dueCount > 0 || deck.newCount > 0);
  const hasDue = dueDecks.length > 0;
  const hasOwnContent = ownCourses.length > 0 || dueDecks.length > 0;
  const hasSubscribed = subscribedCourses.length > 0 || subscribedDecks.length > 0;

  const courseNameById: Record<string, string> = {};
  for (const course of courses) courseNameById[course.id] = course.name;

  const subscribedOwnerIds = [
    ...new Set([
      ...subscribedCourses.map((c) => c.ownerId),
      ...subscribedDecks.map((d) => d.ownerId),
    ]),
  ];
  const ownerLabelsResult = await getOwnerLabels(subscribedOwnerIds);
  const ownerLabels = ownerLabelsResult.ok ? ownerLabelsResult.value : {};

  return (
    <div className="flex flex-col gap-6">
      {!hasOwnContent && !hasSubscribed ? (
        /* No section heading here: the empty state's own heading is the one
           level-2 heading on the page, so screen readers and the AC 8 check
           both land on what actually names this region. */
        <EmptyState
          title={t('emptyTitle')}
          body={t('emptyBody')}
          action={<CreateCourseButton />}
        />
      ) : (
        <div
          className={cn(
            'grid items-start gap-6',
            // Continue studying beside Courses on wide screens — one row for the
            // whole "what is outstanding" view; below tablet it stacks taller.
            hasDue && ownCourses.length > 0 && 'xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]'
          )}
        >
          {hasDue ? (
            <section aria-labelledby="due-heading" className="flex flex-col gap-2">
              <h2 id="due-heading" className="text-ui-lg font-semibold text-primary">
                {t('dueTitle')}
              </h2>
              <DueDecksList decks={dueDecks} courseNameById={courseNameById} />
            </section>
          ) : null}

          {ownCourses.length > 0 ? (
            <section aria-labelledby="courses-heading" className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-3">
                <h2 id="courses-heading" className="text-ui-lg font-semibold text-primary">
                  {tc('listTitle')}
                </h2>
                <CreateCourseButton />
              </div>

              <div
                className={cn(
                  'grid gap-3 sm:grid-cols-2',
                  // Inside the side-by-side layout the Courses column is already
                  // ~3/5 of the width, so two cards a row is plenty; on its own
                  // (no due decks) it gets the full width back and can take more.
                  hasDue ? 'xl:grid-cols-2' : 'lg:grid-cols-3 xl:grid-cols-4'
                )}
              >
                {ownCourses.map((course) => (
                  <CourseCard
                    key={course.id}
                    course={course}
                    dueCount={dueByCourse.get(course.id) ?? 0}
                    isSubscribed={false}
                  />
                ))}
              </div>
            </section>
          ) : (
            // Rare: decks but no course yet — keep the create invite reachable.
            !hasDue && (
              <EmptyState
                title={t('emptyTitle')}
                body={t('emptyBody')}
                action={<CreateCourseButton />}
              />
            )
          )}
        </div>
      )}

      {hasSubscribed ? (
        <SubscribedCreators
          courses={subscribedCourses.map((c) => ({
            id: c.id,
            name: c.name,
            code: c.code,
            ownerId: c.ownerId,
            dueCount: dueByCourse.get(c.id) ?? 0,
          }))}
          decks={subscribedDecks}
          ownerLabels={ownerLabels}
        />
      ) : null}

      <DashboardStats streak={streak} today={today} activity={activity} totalDue={totalDue} />

      {profile && <PublicHandleCard handle={profile.handle} />}
    </div>
  );
}
