// Client: row focus with j/k, Enter to open, c to create.
// Only wires the list-scope shortcuts — the individual rows are links.

'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Route } from 'next';
import Link from 'next/link';
import { useActiveScope } from '@/lib/shortcuts/use-scope';
import { useShortcut } from '@/lib/shortcuts/use-shortcut';
import { cn } from '@/lib/cn';
import { useTranslations } from 'next-intl';
import type { CourseSummary } from '@/lib/db/courses';

type CourseWithSubscription = CourseSummary & { isOwner: boolean; isSubscribed: boolean };

export function CourseListClient({ courses }: { courses: CourseWithSubscription[] }) {
  const router = useRouter();
  const [focused, setFocused] = useState(0);
  const rowsRef = useRef<Array<HTMLAnchorElement | null>>([]);
  const t = useTranslations('courses');

  useActiveScope('list');

  const clamp = (i: number) => Math.max(0, Math.min(i, courses.length - 1));

  useShortcut('list', 'j', () => setFocused((f) => clamp(f + 1)), { label: 'shortcuts.list.next' });
  useShortcut('list', 'k', () => setFocused((f) => clamp(f - 1)), { label: 'shortcuts.list.previous' });
  useShortcut('list', 'ArrowDown', () => setFocused((f) => clamp(f + 1)), { label: 'shortcuts.list.next' });
  useShortcut('list', 'ArrowUp', () => setFocused((f) => clamp(f - 1)), { label: 'shortcuts.list.previous' });
  useShortcut('list', 'Enter', () => {
    const course = courses[focused];
    if (course) router.push(`/app/courses/${course.id}` as Route);
  }, { label: 'shortcuts.list.open' });
  useShortcut('list', 'c', () => router.push('/app/courses/new' as Route), { label: 'shortcuts.list.createCourse' });

  return (
    <ul className="flex flex-col gap-1">
      {courses.map((course, i) => (
        <li key={course.id}>
          <Link
            ref={(el) => { rowsRef.current[i] = el; }}
            href={`/app/courses/${course.id}`}
            onMouseEnter={() => setFocused(i)}
            className={cn(
              'flex items-center justify-between gap-3 rounded-sm px-3 py-3 text-ui-sm transition-colors ease-out',
              focused === i ? 'bg-inset text-primary' : 'text-secondary hover:bg-inset hover:text-primary'
            )}
          >
            <span className="truncate">
              {course.name}
              {course.code ? <span className="ml-2 text-tertiary">{course.code}</span> : null}
            </span>
            {course.isSubscribed && (
              <span className="rounded-sm bg-inset px-2 py-1 text-ui-xs font-medium text-secondary shrink-0">
                {t('list.subscribed')}
              </span>
            )}
          </Link>
        </li>
      ))}
    </ul>
  );
}
