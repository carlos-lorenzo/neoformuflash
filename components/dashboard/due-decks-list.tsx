// Server Component: decks with outstanding cards, grouped by course.
// Each course group is collapsed by default — clicking its header expands it
// to show every deck, each linked straight into its review session.
// Course-less decks live under an "ungrouped" section (always expanded).

import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import type { Route } from 'next';
import type { DeckSummary } from '@/lib/db/decks';

type DueDecksListProps = {
  decks: DeckSummary[];
  /** courseId → course name, for decks that sit inside a course the user sees. */
  courseNameById: Record<string, string>;
};

function deckHref(deck: DeckSummary): Route {
  // Course-scoped decks keep their review URL; course-less decks use the
  // universal study route so every deck is studyable.
  return deck.courseId
    ? (`/app/courses/${deck.courseId}/review/${deck.id}` as Route)
    : (`/app/decks/${deck.id}/study` as Route);
}

async function DeckRow({ deck, courseName }: { deck: DeckSummary; courseName?: string }) {
  const t = await getTranslations('dashboard');
  return (
    <Link
      href={deckHref(deck)}
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
  );
}

export async function DueDecksList({ decks, courseNameById }: DueDecksListProps) {
  const t = await getTranslations('dashboard');

  const byCourse = new Map<string | null, DeckSummary[]>();
  for (const deck of decks) {
    const key = deck.courseId ?? null;
    const list = byCourse.get(key) ?? [];
    list.push(deck);
    byCourse.set(key, list);
  }

  const courseGroups = [...byCourse.entries()].filter(([key]) => key !== null);
  const ungrouped = byCourse.get(null) ?? [];

  return (
    <div className="flex flex-col gap-4">
      {courseGroups.map(([courseId, group]) => {
        const courseName = courseNameById[courseId as string] ?? t('ungrouped');
        const totalDue = group.reduce((n, d) => n + d.dueCount, 0);
        return (
          // No `open`: collapsed by default, no JS needed to toggle.
          <details
            key={courseId}
            className="rounded-md border border-subtle bg-raised px-3 py-2"
          >
            <summary className="flex cursor-pointer items-center gap-2 py-1">
              <span aria-hidden="true" className="text-ui-xs text-tertiary">›</span>
              <span className="min-w-0 flex-1 truncate text-ui-sm font-semibold text-primary">
                {courseName}
              </span>
              {totalDue > 0 ? (
                <span
                  aria-hidden="true"
                  className="flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full bg-accent px-2 text-ui-xs font-medium text-on-accent"
                >
                  {totalDue}
                </span>
              ) : null}
              <span className="sr-only">
                {totalDue > 0 ? t('dueCount', { count: totalDue }) : ''}
              </span>
            </summary>
            <ul className="flex flex-col gap-2 pt-2">
              {group.map((deck) => (
                <li key={deck.id}>
                  <DeckRow deck={deck} courseName={courseName} />
                </li>
              ))}
            </ul>
            <div className="flex justify-end py-2">
              <Link
                href={`/app/courses/${courseId}`}
                className="shrink-0 text-ui-xs text-tertiary hover:text-primary"
              >
                {t('seeAll')}
              </Link>
            </div>
          </details>
        );
      })}
      {ungrouped.length > 0 ? (
        <section aria-label={t('ungrouped')}>
          {courseGroups.length > 0 ? (
            <h3 className="mb-1 text-ui-sm font-semibold text-secondary">{t('ungrouped')}</h3>
          ) : null}
          <ul className="flex flex-col gap-2">
            {ungrouped.map((deck) => (
              <li key={deck.id}>
                <DeckRow deck={deck} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
