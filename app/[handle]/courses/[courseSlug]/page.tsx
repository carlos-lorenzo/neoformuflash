// Server Component: public course page at /@handle/courses/course-slug.
// Renders the course's public decks and notes. Returns 404 if private/deleted.

import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import type { Route } from 'next';
import { getPublicCourseBySlug, getPublicCourseBySlugPublic } from '@/lib/db/courses';
import { listCourseDecks } from '@/lib/db/decks';
import { listPublicCourseNotes } from '@/lib/db/notes';
import { parseHandleSegment } from '@/lib/public/handle';
import { UsersIcon, CodeForkIcon } from '@/components/ui/icon';
import { ShareActionsServer } from '@/components/share/share-actions-server';

export async function generateMetadata({ params }: { params: Promise<{ handle: string; courseSlug: string }> }) {
  const { handle: segment, courseSlug } = await params;
  const handle = parseHandleSegment(segment);
  if (!handle) return { title: 'Not found · FormuFlash' };

  const courseResult = await getPublicCourseBySlug(handle, courseSlug);
  if (!courseResult.ok || !courseResult.value) {
    return { title: 'Not found · FormuFlash' };
  }

  const course = courseResult.value;
  const t = await getTranslations('publicProfile');
  return {
    title: `${course.name} · @${handle} · FormuFlash`,
    description: t('course.metaDescription', { name: course.name, handle: `@${handle}` }),
    alternates: {
      canonical: `${process.env.NEXT_PUBLIC_SITE_URL ?? 'https://formuflash.com'}/@${handle}/courses/${courseSlug}`,
    },
  };
}

export default async function PublicCoursePage({
  params,
}: {
  params: Promise<{ handle: string; courseSlug: string }>;
}) {
  const { handle: segment, courseSlug } = await params;
  const handle = parseHandleSegment(segment);
  if (!handle) notFound();

  const t = await getTranslations('publicProfile');

  const courseResult = await getPublicCourseBySlugPublic(handle, courseSlug);
  if (!courseResult.ok || !courseResult.value) notFound();
  const course = courseResult.value;

  // Public page has no authenticated user — pass the owner's id for deck visibility.
  const [decksResult, notesResult] = await Promise.all([
    listCourseDecks(course.id, course.ownerId),
    listPublicCourseNotes(course.id),
  ]);

  const decks = decksResult.ok ? decksResult.value : [];
  const notes = notesResult.ok ? notesResult.value : [];

  // Filter decks: only public/unlisted are visible on the public page.
  const publicDecks = decks.filter((d) => d.visibility !== 'private');

  const profileUrl = `/@${handle}` as Route;

  return (
    <div className="mx-auto w-full max-w-measure px-4 py-8">
      {/* Breadcrumb */}
      <nav className="mb-6 flex items-center gap-1 text-ui-sm text-secondary" aria-label={t('breadcrumb')}>
        <Link href={profileUrl} className="hover:text-primary">
          @{handle}
        </Link>
        <span aria-hidden="true">/</span>
        <Link
          href={`/@${handle}/courses/${courseSlug}`}
          className="hover:text-primary font-medium text-primary"
          aria-current="page"
        >
          {course.name}
        </Link>
      </nav>

      <header className="mb-8">
        <h1 className="text-read-h1 font-semibold text-primary">{course.name}</h1>
        {course.code && (
          <p className="mt-2 text-ui-sm text-tertiary font-mono">{course.code}</p>
        )}
        <div className="mt-4 flex items-center gap-4 text-ui-xs tracking-ui text-tertiary">
          <span className="flex items-center gap-1" title={t('course.subscribers')}>
            <UsersIcon className="text-tertiary" /> {course.subscriberCount}
          </span>
          <span className="flex items-center gap-1" title={t('course.forks')}>
            <CodeForkIcon className="text-tertiary" /> {course.forkCount}
          </span>
        </div>
        {/* Share actions (subscribe/fork) */}
        <div className="mt-4">
          <ShareActionsServer course={course} isOwner={false} />
        </div>
      </header>

      {/* Decks section */}
      <section aria-labelledby="decks-heading" className="mb-8">
        <h2 id="decks-heading" className="mb-4 text-ui-lg font-semibold text-primary">
          {t('sections.decks')}
        </h2>
        {publicDecks.length === 0 ? (
          <p className="text-ui-sm text-secondary">{t('sections.noDecks')}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {publicDecks.map((deck) => (
              <li key={deck.id}>
                <Link
                  href={`/@${handle}/${deck.slug}`}
                  className="flex items-center gap-3 rounded-md border border-subtle bg-raised p-3 transition-colors ease-out hover:border-strong"
                >
                  <div className="flex-1 min-w-0">
                    <h3 className="truncate text-ui-base font-semibold text-primary">{deck.title}</h3>
                    <p className="mt-1 text-ui-xs text-tertiary">
                      {t('detail.dueCount', { count: deck.dueCount })}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Notes section */}
      <section aria-labelledby="notes-heading">
        <h2 id="notes-heading" className="mb-4 text-ui-lg font-semibold text-primary">
          {t('sections.notes')}
        </h2>
        {notes.length === 0 ? (
          <p className="text-ui-sm text-secondary">{t('sections.noNotes')}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {notes.map((note) => (
              <li key={note.id}>
                <Link
                  href={`/@${handle}/${note.slug}`}
                  className="flex items-start gap-3 rounded-md border border-subtle bg-raised p-3 transition-colors ease-out hover:border-strong"
                >
                  <div className="flex-1 min-w-0">
                    <h3 className="truncate text-ui-base font-semibold text-primary">{note.title}</h3>
                    <p className="mt-1 text-ui-xs text-tertiary">
                      {note.updatedAt ? new Date(note.updatedAt).toLocaleDateString() : ''}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}