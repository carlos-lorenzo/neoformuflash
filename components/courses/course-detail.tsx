// Server Component: a course's header (name, code, visibility), the decks it
// contains, and the settings form.
// Renders differently for owners vs subscribers.

import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import type { CourseRow } from '@/lib/db/courses';
import type { DeckSummary } from '@/lib/db/decks';
import type { NoteSummary } from '@/lib/db/notes';
import { CourseForm } from './course-form';
import { CreateDeckInCourse } from './create-deck-in-course';
import { DeleteCourseButton } from './delete-course-button';
import { CreateNoteButton } from '@/components/editor/create-note-button';
import { ShareActionsServer } from '@/components/share/share-actions-server';

interface CourseDetailProps {
  course: CourseRow;
  decks: DeckSummary[];
  notes: NoteSummary[];
  isOwner: boolean;
  isSubscribed: boolean;
}

export async function CourseDetail({
  course,
  decks,
  notes,
  isOwner,
  isSubscribed,
}: CourseDetailProps) {
  const t = await getTranslations('courses');

  return (
    <div className="mx-auto w-full max-w-measure px-4 py-8">
      <p className="text-ui-xs tracking-ui text-tertiary uppercase">{t('detail.eyebrow')}</p>
      <div className="mb-1 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h1 className="text-ui-xl font-semibold text-primary">{course.name}</h1>
          {/* Subscribed badge */}
          {isSubscribed && (
            <span className="rounded-sm bg-inset px-2 py-1 text-ui-xs font-medium text-secondary">
              {t('detail.subscribed')}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isOwner ? (
            <>
              <CreateNoteButton courseId={course.id} />
              <CreateDeckInCourse courseId={course.id} />
            </>
          ) : null}
        </div>
      </div>
      {course.code ? (
        <p className="mb-6 text-ui-sm text-tertiary">{course.code}</p>
      ) : null}

      <h2 className="mb-2 text-ui-lg font-semibold text-primary">{t('detail.decks')}</h2>
      {decks.length === 0 ? (
        <div className="mb-6 flex flex-col gap-2">
          <p className="text-ui-sm text-secondary">{t('detail.noDecks')}</p>
          {isOwner && <CreateDeckInCourse courseId={course.id} />}
        </div>
      ) : (
        <ul className="mb-6 flex flex-col gap-1">
          {decks.map((deck) => (
            <li key={deck.id}>
              <Link
                href={`/app/decks/${deck.id}`}
                className="flex items-center rounded-sm px-3 py-3 text-ui-sm text-secondary transition-colors ease-out hover:bg-inset hover:text-primary"
              >
                <span className="truncate">{deck.title}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <h2 className="mb-2 text-ui-lg font-semibold text-primary">{t('detail.notes')}</h2>
      {notes.length === 0 ? (
        <div className="mb-6 flex flex-col gap-2">
          <p className="text-ui-sm text-secondary">{t('detail.noNotes')}</p>
          {isOwner && <CreateNoteButton courseId={course.id} />}
        </div>
      ) : (
        <ul className="mb-6 flex flex-col gap-1">
          {notes.map((note) => (
            <li key={note.id}>
              <Link
                href={`/app/notes/${note.id}`}
                className="flex items-center rounded-sm px-3 py-3 text-ui-sm text-secondary transition-colors ease-out hover:bg-inset hover:text-primary"
              >
                <span className="truncate">{note.title}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {isOwner ? (
        // Owner view: settings + delete
        <details className="mb-6 rounded-md border border-subtle" open={course.name === 'Untitled course'}>
          <summary className="flex items-center justify-between cursor-pointer select-none p-4">
            <span className="text-ui-sm font-semibold text-secondary">{t('detail.settings')}</span>
            <span className="text-ui-xs text-tertiary">›</span>
          </summary>
          <div className="p-4 border-t border-subtle">
            <CourseForm
              course={{
                id: course.id,
                name: course.name,
                code: course.code,
                language: course.language,
                visibility: course.visibility,
              }}
            />
            <div className="mt-4 border-t border-subtle pt-4">
              <DeleteCourseButton courseId={course.id} />
            </div>
          </div>
        </details>
      ) : isSubscribed ? (
        // Subscriber view: unsubscribe + fork
        <div className="mb-6 rounded-md border border-subtle p-4">
          <div className="flex items-center gap-2">
            <ShareActionsServer course={{ id: course.id, slug: course.slug, name: course.name, code: course.code, subscriberCount: course.subscriberCount, forkCount: course.forkCount, ownerId: course.ownerId }} isOwner={false} />
          </div>
        </div>
      ) : null}
    </div>
  );
}