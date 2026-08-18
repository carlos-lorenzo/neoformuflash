// Server Component: a course card for the dashboard grid. Shows name, code, due count,
// and links to the course detail page.

import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import type { CourseSummary } from '@/lib/db/courses';

export async function CourseCard({ course, dueCount }: { course: CourseSummary; dueCount: number }) {
  const t = await getTranslations('dashboard');

  return (
    <Link
      href={`/app/courses/${course.id}`}
      className="group flex flex-col gap-2 rounded-lg border border-subtle bg-raised p-4 transition-colors hover:border-accent hover:bg-inset"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-ui-base font-semibold text-primary group-hover:text-accent">
            {course.name}
          </h3>
          {course.code ? (
            <p className="mt-1 truncate text-ui-sm text-tertiary">{course.code}</p>
          ) : null}
        </div>
        {dueCount > 0 && (
          <span className="flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full bg-accent px-2 text-ui-xs font-medium text-on-accent">
            {dueCount}
          </span>
        )}
      </div>

      <div className="mt-auto flex items-center justify-between pt-2 border-t border-subtle">
        <span className="text-ui-xs text-tertiary uppercase tracking-ui">
          {t('courseEyebrow')}
        </span>
        <span className="text-ui-xs text-accent group-hover:underline">
          {t('openCourse')}
        </span>
      </div>
    </Link>
  );
}