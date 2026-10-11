// Client: subscribed content grouped by creator. One tab per person you
// subscribed to — click a tab to see all of that person's courses and decks.
// Subscribed items no longer render as your own decks/courses.

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { Route } from 'next';
import type { DeckSummary } from '@/lib/db/decks';

export type SubscribedCourse = {
  id: string;
  name: string;
  code: string | null;
  ownerId: string;
  dueCount: number;
};

export type OwnerLabel = { handle: string; displayName: string };

export function SubscribedCreators({
  courses,
  decks,
  ownerLabels,
}: {
  courses: SubscribedCourse[];
  decks: DeckSummary[];
  ownerLabels: Record<string, OwnerLabel>;
}) {
  const t = useTranslations('dashboard');
  const [active, setActive] = useState<string | null>(null);

  const ownerIds = [...new Set([...courses.map((c) => c.ownerId), ...decks.map((d) => d.ownerId)])];
  if (ownerIds.length === 0) return null;

  const selected = active ?? ownerIds[0]!;
  const activeCourses = courses.filter((c) => c.ownerId === selected);
  const activeDecks = decks.filter((d) => d.ownerId === selected);
  const label = ownerLabels[selected];

  return (
    <section aria-labelledby="subscribed-heading" className="flex flex-col gap-2">
      <h2 id="subscribed-heading" className="text-ui-lg font-semibold text-primary">
        {t('subscribedTitle')}
      </h2>
      <div role="tablist" aria-label={t('subscribedTitle')} className="flex flex-wrap gap-2">
        {ownerIds.map((ownerId) => {
          const owner = ownerLabels[ownerId];
          const name = owner ? `@${owner.handle}` : ownerId.slice(0, 8);
          const isActive = ownerId === selected;
          return (
            <button
              key={ownerId}
              role="tab"
              aria-selected={isActive}
              onClick={() => setActive(ownerId)}
              className={`rounded-full border px-3 py-1 text-ui-sm font-medium ${
                isActive
                  ? 'border-accent bg-accent text-on-accent'
                  : 'border-subtle text-secondary hover:text-primary'
              }`}
            >
              {name}
            </button>
          );
        })}
      </div>

      <div role="tabpanel" className="flex flex-col gap-3">
        {label ? (
          <p className="text-ui-sm text-secondary">
            {label.displayName} · @{label.handle}
          </p>
        ) : null}
        <h3 className="text-ui-sm font-semibold text-secondary">{t('subscribedCourses')}</h3>
        {activeCourses.length === 0 ? (
          <p className="text-ui-sm text-tertiary">{t('subscribedEmpty')}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {activeCourses.map((course) => (
              <li key={course.id}>
                <Link
                  href={`/app/courses/${course.id}`}
                  className="flex items-center justify-between gap-2 rounded-md border border-subtle bg-raised px-3 py-3 hover:border-accent"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-ui-sm font-medium text-primary">
                      {course.name}
                    </span>
                    {course.code ? (
                      <span className="block truncate text-ui-xs text-tertiary">{course.code}</span>
                    ) : null}
                  </span>
                  {course.dueCount > 0 ? (
                    <span className="flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full bg-accent px-2 text-ui-xs font-medium text-on-accent">
                      {course.dueCount}
                    </span>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        )}

        <h3 className="text-ui-sm font-semibold text-secondary">{t('subscribedDecks')}</h3>
        {activeDecks.length === 0 ? (
          <p className="text-ui-sm text-tertiary">{t('subscribedEmpty')}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {activeDecks.map((deck) => (
              <li key={deck.id}>
                <Link
                  href={`/app/decks/${deck.id}` as Route}
                  className="flex items-center justify-between gap-2 rounded-md border border-subtle bg-raised px-3 py-3 hover:border-accent"
                >
                  <span className="truncate text-ui-sm font-medium text-primary">{deck.title}</span>
                  {deck.dueCount > 0 ? (
                    <span className="flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full bg-accent px-2 text-ui-xs font-medium text-on-accent">
                      {deck.dueCount}
                    </span>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
