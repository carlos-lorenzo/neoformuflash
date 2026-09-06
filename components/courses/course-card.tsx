// Server Component: a course card for the dashboard. Name, code, due pill and a
// subscribed tag — one compact tile. The whole card is the link, so there is no
// separate affordance row to add height.

import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import type { CourseSummary } from '@/lib/db/courses';

export async function CourseCard({
  course,
  dueCount,
  isSubscribed = false,
}: {
  course: CourseSummary;
  dueCount: number;
  isSubscribed?: boolean;
}) {
  const tc = await getTranslations('courses');

  return (
    <Link
      href={`/app/courses/${course.id}`}
      className="group flex flex-col gap-2 rounded-lg border border-subtle bg-raised p-3 transition-colors hover:border-accent hover:bg-inset"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-ui-base font-semibold text-primary group-hover:text-accent">
            {course.name}
          </h3>
          {course.code ? (
            <p className="mt-1 truncate text-ui-sm text-tertiary">{course.code}</p>
          ) : null}
          {isSubscribed ? (
            <span className="mt-2 inline-flex rounded-sm bg-inset px-2 py-1 text-ui-xs font-medium text-secondary">
              {tc('list.subscribed')}
            </span>
          ) : null}
        </div>
        {dueCount > 0 && (
          <span className="flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full bg-accent px-2 text-ui-xs font-medium text-on-accent">
            {dueCount}
          </span>
        )}
      </div>
    </Link>
  );
}
