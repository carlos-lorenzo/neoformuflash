/**
 * Server Component: read-only view of a note that belongs to someone else and
 * is reached through a course subscription. Subscribers must not get the editor
 * for a note they don't own — they get the same read-only rendering the public
 * pages use, with a fork affordance to make an editable copy of their own.
 */

import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import type { NoteRow } from '@/lib/db/notes';
import { NoteDocView } from './note-doc-view';
import { ForkButton } from '@/components/share/fork-button';

interface NoteReaderProps {
  note: NoteRow;
  course: { id: string; name: string; forkCount: number } | null;
}

export async function NoteReader({ note, course }: NoteReaderProps) {
  const t = await getTranslations('notes.reader');

  return (
    <div className="mx-auto w-full max-w-measure px-4 py-8">
      {/* Breadcrumb: course (if any) → note title */}
      <nav className="mb-6 flex flex-wrap items-center gap-1 text-ui-sm text-secondary" aria-label={t('breadcrumb')}>
        {course ? (
          <>
            <Link href={`/app/courses/${course.id}`} className="hover:text-primary">
              {course.name}
            </Link>
            <span aria-hidden="true">/</span>
          </>
        ) : null}
        <span className="font-medium text-primary" aria-current="page">
          {note.title}
        </span>
      </nav>

      <article className="prose prose-neutral max-w-none">
        <header className="mb-4">
          <div className="mb-3 flex items-center gap-3">
            <span className="inline-flex items-center rounded-sm bg-inset px-2 py-1 text-ui-xs font-medium text-secondary uppercase">
              {t('badge')}
            </span>
          </div>
          <h1 className="text-read-h1 font-semibold text-primary">{note.title}</h1>
        </header>

        {course ? (
          <div className="mb-6 flex flex-col gap-2 rounded-md border border-subtle bg-raised p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-ui-sm text-secondary">{t('subscriberBody', { course: course.name })}</p>
            <ForkButton
              targetId={course.id}
              targetType="course"
              forkCount={course.forkCount}
              isOwner={false}
              isAuthenticated
            />
          </div>
        ) : null}

        <div className="note-content">
          <NoteDocView doc={note.contentJson} />
        </div>
      </article>
    </div>
  );
}
