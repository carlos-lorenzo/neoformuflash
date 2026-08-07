// Server Component: renders the user's note list or an empty-state invitation.
// "No notes yet" is not acceptable copy — see design-system.md §7.

import { getTranslations } from 'next-intl/server';
import type { NoteSummary } from '@/lib/db/notes';
import { CreateNoteButton } from './create-note-button';

export async function NoteList({ notes }: { notes: NoteSummary[] }) {
  const t = await getTranslations('notes');

  if (notes.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 py-16 text-center">
        <p className="text-ui-lg font-semibold text-primary">{t('emptyTitle')}</p>
        <p className="max-w-sm text-ui-base text-secondary">{t('emptyBody')}</p>
        <CreateNoteButton />
      </div>
    );
  }

  return (
    <ul className="flex flex-col divide-y divide-subtle">
      {notes.map((note) => (
        <li key={note.id}>
          <a
            href={`/app/notes/${note.id}`}
            className="flex h-11 items-center px-2 text-ui-base text-primary hover:bg-inset"
          >
            <span className="truncate">{note.title}</span>
          </a>
        </li>
      ))}
    </ul>
  );
}
