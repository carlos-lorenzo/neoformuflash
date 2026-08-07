// Server Component: renders the user's note list or an empty-state invitation.
// "No notes yet" is not acceptable copy — see design-system.md §7.
//
// The "New note" button must be reachable in BOTH states: it is the only way to
// create a second note once the list is non-empty (a regression that shipped
// when the button lived only in the empty state).

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
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h1 className="text-ui-lg font-semibold text-primary">{t('listTitle')}</h1>
        <CreateNoteButton />
      </div>
      <ul className="flex flex-col divide-y divide-subtle">
        {notes.map((note) => (
          <li key={note.id}>
            <a
              href={`/app/notes/${note.id}`}
              className="flex flex-col gap-1 px-2 py-3 transition-colors hover:bg-inset"
            >
              <span className="text-ui-base text-primary">{note.title}</span>
              {note.contentText ? (
                <span className="truncate text-ui-sm text-secondary">
                  {note.contentText.slice(0, 120)}
                </span>
              ) : null}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
