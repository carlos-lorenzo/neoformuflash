// Server Component: decks with outstanding cards, each linked straight into its
// review session. Single-line rows so the list stays compact.

import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import type { Route } from 'next';
import type { DeckSummary } from '@/lib/db/decks';

type DueDecksListProps = {
  decks: DeckSummary[];
  /** courseId → course name, for decks that sit inside a course the user sees. */
  courseNameById: Record<string, string>;
};

export async function DueDecksList({ decks, courseNameById }: DueDecksListProps) {
  const t = await getTranslations('dashboard');

  return (
    <ul className="flex flex-col gap-2">
      {decks.map((deck) => {
        // Review sessions are course-scoped (phase-03c); a course-less deck has
        // no review URL today, so it falls back to its deck page.
        const href = deck.courseId
          ? (`/app/courses/${deck.courseId}/review/${deck.id}` as Route)
          : (`/app/decks/${deck.id}` as Route);

        const courseName = deck.courseId ? courseNameById[deck.courseId] : undefined;

        return (
          <li key={deck.id}>
            <Link
              href={href}
              className="duration-instant group flex min-h-11 items-center gap-3 rounded-md border border-subtle bg-raised px-3 transition-colors ease-out hover:border-accent hover:bg-inset"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-ui-sm font-medium text-primary group-hover:text-accent">
                  {deck.title}
                </p>
              </div>

              {/* The counts as tiny pills; the words go in the accessible name
                  so a screen reader still hears "3 due, 2 new". */}
              <span className="sr-only">
                {courseName ? `${courseName}. ` : ''}
                {deck.dueCount > 0 ? t('dueCount', { count: deck.dueCount }) : ''}
                {deck.dueCount > 0 && deck.newCount > 0 ? '. ' : ''}
                {deck.newCount > 0 ? t('newCount', { count: deck.newCount }) : ''}
              </span>
              {deck.dueCount > 0 ? (
                <span
                  aria-hidden="true"
                  className="flex h-6 min-w-6 items-center justify-center rounded-full bg-accent px-2 text-ui-xs font-medium text-on-accent"
                >
                  {deck.dueCount}
                </span>
              ) : null}
              {deck.newCount > 0 ? (
                <span
                  aria-hidden="true"
                  className="flex h-6 items-center justify-center rounded-full bg-inset px-2 text-ui-xs font-medium text-secondary"
                >
                  {deck.newCount}
                </span>
              ) : null}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
