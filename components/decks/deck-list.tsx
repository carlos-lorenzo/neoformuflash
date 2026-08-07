// Server Component: renders the user's deck list or an empty-state invitation.
//
// Follows the notes list discipline (components/editor/note-list.tsx):
// "No decks yet" is not acceptable copy — see design-system.md §7. The
// "Create deck" action must be reachable in BOTH states.

import { getTranslations } from 'next-intl/server';
import type { DeckSummary, Streak } from '@/lib/db/decks';
import { DeckListClient } from './deck-list-row';
import { CreateDeckButton } from './create-deck-button';

export async function DeckList({
  decks,
  streak,
}: {
  decks: DeckSummary[];
  streak: Streak | null;
}) {
  const t = await getTranslations('decks');

  if (decks.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 py-16 text-center">
        <p className="text-ui-lg font-semibold text-primary">{t('emptyTitle')}</p>
        <p className="max-w-sm text-ui-base text-secondary">{t('emptyBody')}</p>
        <CreateDeckButton />
        <p className="text-ui-xs tracking-ui text-tertiary">{t('shortcutHint')}</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h1 className="text-ui-lg font-semibold text-primary">{t('listTitle')}</h1>
        <CreateDeckButton />
      </div>
      <DeckListClient decks={decks} streak={streak} />
    </div>
  );
}
