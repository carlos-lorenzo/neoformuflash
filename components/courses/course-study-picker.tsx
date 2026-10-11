'use client';

/*
 * Course study picker: study the whole course or a subset of its decks.
 * Links into the multi-deck FSRS study route (/app/courses/[id]/study) and
 * the multi-deck practice route (/app/courses/[id]/practice).
 */

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { Route } from 'next';
import type { DeckSummary } from '@/lib/db/decks';
import { Button } from '@/components/ui/button';

export function CourseStudyPicker({
  courseId,
  decks,
}: {
  courseId: string;
  decks: DeckSummary[];
}) {
  const t = useTranslations('courses');
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set(decks.map((d) => d.id)));

  if (decks.length === 0) return null;

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectedIds = decks.filter((d) => selected.has(d.id)).map((d) => d.id);
  const subsetQuery = selectedIds.length > 0 ? `?decks=${selectedIds.join(',')}` : '';

  return (
    <div className="mb-6 rounded-md border border-subtle p-4">
      <h2 className="text-ui-base font-semibold text-primary">{t('study.title')}</h2>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button
          variant="primary"
          onClick={() => router.push(`/app/courses/${courseId}/study` as Route)}
        >
          {t('study.whole')}
        </Button>
        <Button
          variant="secondary"
          onClick={() => router.push(`/app/courses/${courseId}/practice` as Route)}
        >
          {t('study.practiceWhole')}
        </Button>
      </div>

      <fieldset className="mt-4">
        <legend className="text-ui-sm font-medium text-secondary">{t('study.pickDecks')}</legend>
        <ul className="mt-2 flex max-h-outline flex-col gap-1 overflow-y-auto">
          {decks.map((deck) => (
            <li key={deck.id}>
              <label className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-2 hover:bg-raised">
                <input
                  type="checkbox"
                  checked={selected.has(deck.id)}
                  onChange={() => toggle(deck.id)}
                />
                <span className="min-w-0 flex-1 truncate text-ui-sm text-primary">
                  {deck.title}
                </span>
                <Link
                  href={`/app/decks/${deck.id}`}
                  className="shrink-0 text-ui-xs text-tertiary hover:text-primary"
                  onClick={(e) => e.stopPropagation()}
                >
                  {t('study.openDeck')}
                </Link>
              </label>
            </li>
          ))}
        </ul>
      </fieldset>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          variant="primary"
          disabled={selectedIds.length === 0}
          onClick={() => router.push(`/app/courses/${courseId}/study${subsetQuery}` as Route)}
        >
          {t('study.selected', { count: selectedIds.length })}
        </Button>
        <Button
          variant="secondary"
          disabled={selectedIds.length === 0}
          onClick={() => router.push(`/app/courses/${courseId}/practice${subsetQuery}` as Route)}
        >
          {t('study.practiceSelected', { count: selectedIds.length })}
        </Button>
      </div>
    </div>
  );
}
