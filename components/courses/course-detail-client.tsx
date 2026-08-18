'use client';

/*
 * Client wrapper that adds list-scoped shortcuts to the course detail page.
 * `d` → create deck, `n` → create note (phase-03c spec risk 5).
 * Only enabled for course owners (not subscribers).
 *
 * Kept separate from the server CourseDetail component: React forbids mixing a
 * 'use client' directive with a sibling server component in one module, and the
 * page imports both — the server component for rendering, this for shortcuts.
 */

import { useActiveScope } from '@/lib/shortcuts/use-scope';
import { useShortcut } from '@/lib/shortcuts/use-shortcut';
import type { CourseRow } from '@/lib/db/courses';
import type { ReactNode } from 'react';

interface CourseDetailClientProps {
  course: CourseRow;
  isOwner: boolean;
  children: ReactNode;
}

export function CourseDetailClient({ course, isOwner, children }: CourseDetailClientProps) {
  useActiveScope('list');

  // d → create deck (owner only)
  useShortcut('list', 'd', () => {
    if (!isOwner) return;
    const formData = new FormData();
    formData.set('title', '');
    formData.set('courseId', course.id);
    import('@/app/app/decks/actions').then(({ createDeck }) => createDeck({ errors: {} }, formData));
  }, { label: 'shortcuts.list.createDeck' });

  // n → create note (owner only)
  useShortcut('list', 'n', () => {
    if (!isOwner) return;
    const formData = new FormData();
    formData.set('title', '');
    formData.set('courseId', course.id);
    import('@/app/app/notes/actions').then(({ createNote }) => createNote({ errors: {} }, formData));
  }, { label: 'shortcuts.list.createNote' });

  return <>{children}</>;
}
