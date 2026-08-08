// Client: row focus with j/k, Enter to open, s to study, c to create.
// Only wires the list-scope shortcuts — the individual rows are links.

'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useActiveScope } from '@/lib/shortcuts/use-scope';
import { useShortcut } from '@/lib/shortcuts/use-shortcut';
import { cn } from '@/lib/cn';
import type { DeckSummary, Streak } from '@/lib/db/decks';
import { CreateDeckButton } from './create-deck-button';

export function DeckListClient({
  decks,
  streak,
}: {
  decks: DeckSummary[];
  streak: Streak | null;
}) {
  const t = useTranslations('decks');
  const router = useRouter();
  const [focusedIndex, setFocusedIndex] = useState(0);
  const containerRef = useRef<HTMLUListElement>(null);

  useActiveScope('list');

  // Clamp in render, not in an effect: keeping an out-of-bounds focus
  // index state would trip react-hooks/set-state-in-effect.
  const clampedIndex = Math.min(focusedIndex, Math.max(0, decks.length - 1));

  useShortcut('list', 'j', () => {
    setFocusedIndex((i) => Math.min(decks.length - 1, i + 1));
  });
  useShortcut('list', 'k', () => {
    setFocusedIndex((i) => Math.max(0, i - 1));
  });
  useShortcut('list', 'Enter', () => {
    const deck = decks[clampedIndex];
    if (deck) router.push(`/app/decks/${deck.id}`);
  });
  useShortcut('list', 's', () => {
    const deck = decks[clampedIndex];
    if (deck) router.push(`/review/${deck.id}`);
  });
  useShortcut('list', 'c', () => {
    router.push('/app/decks/new');
  });

  return (
    <div>
      <ul ref={containerRef} className="flex flex-col divide-y divide-subtle">
        {decks.map((deck, i) => {
          const focused = i === clampedIndex;
          const hasDue = deck.dueCount > 0;
          return (
            <li key={deck.id}>
              <div
                className={cn(
                  'flex items-center gap-3 px-2 py-3',
                  focused && 'bg-inset'
                )}
              >
                <Link
                  href={`/app/decks/${deck.id}`}
                  className="flex min-w-0 flex-1 flex-col gap-1"
                >
                  <span className="truncate text-ui-base text-primary">{deck.title}</span>
                  <span className="truncate text-ui-sm text-secondary">
                    {hasDue
                      ? t('dueCount', { count: deck.dueCount })
                      : deck.newCount > 0
                        ? t('newCount', { count: deck.newCount })
                        : t('allCaughtUp')}
                  </span>
                </Link>

                <a
                  href={`/review/${deck.id}`}
                  className={cn(
                    'shrink-0 rounded-sm px-3 py-2 text-ui-sm font-medium',
                    hasDue
                      ? 'bg-accent text-on-accent hover:bg-accent-hover'
                      : 'border border-subtle text-secondary hover:border-strong'
                  )}
                >
                  {t('detail.study')}
                </a>
              </div>
            </li>
          );
        })}
      </ul>

      {streak ? (
        <p className="mt-3 text-ui-xs tracking-ui text-tertiary">
          {t('streak', { current: streak.current, longest: streak.longest })}
        </p>
      ) : null}

      <div className="mt-4 flex items-center justify-between">
        <CreateDeckButton />
        <p className="text-ui-xs tracking-ui text-tertiary">
          {t('keyboardHint', { keys: 'j/k · Enter · s · c' })}
        </p>
      </div>
    </div>
  );
}
