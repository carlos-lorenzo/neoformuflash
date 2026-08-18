// Server Component: a course card for the public profile grid.

import Link from 'next/link';
import type { Route } from 'next';
import { getTranslations } from 'next-intl/server';
import type { PublicCourse } from '@neoformuflash/contracts';
import { getSessionUser } from '@/lib/supabase/session';
import { UsersIcon, CodeForkIcon } from '@/components/ui/icon';
import { ShareActionsServer } from '@/components/share/share-actions-server';

export async function PublicCourseCard({ handle, course }: { handle: string; course: PublicCourse }) {
  const t = await getTranslations('publicProfile');

  // Get current user to determine ownership
  const user = await getSessionUser();
  const isOwner = user?.id === course.ownerId;

  return (
    <Link
      href={`/@${handle}/courses/${course.slug}` as Route}
      className="flex flex-col gap-3 rounded-md border border-subtle bg-raised p-4 transition-colors ease-out hover:border-strong"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-ui-base font-semibold text-primary">{course.name}</h3>
          {course.code ? (
            <p className="mt-1 truncate text-ui-sm text-tertiary">{course.code}</p>
          ) : null}
        </div>
      </div>

      <div className="flex items-center gap-4 text-ui-xs tracking-ui text-tertiary">
        <span className="flex items-center gap-1" title={t('course.subscribers')}>
          <UsersIcon className="text-tertiary" /> {course.subscriberCount}
        </span>
        <span className="flex items-center gap-1" title={t('course.forks')}>
          <CodeForkIcon className="text-tertiary" /> {course.forkCount}
        </span>
      </div>

      {/* Share actions (subscribe/fork) — only show if not owner */}
      {!isOwner && (
        <div className="mt-2 pt-2 border-t border-subtle">
          <ShareActionsServer course={course} isOwner={isOwner} />
        </div>
      )}
    </Link>
  );
}