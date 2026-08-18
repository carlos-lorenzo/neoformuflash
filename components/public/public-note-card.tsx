// Server Component: a note card for the public profile list.

import Link from 'next/link';
import type { Route } from 'next';
import type { PublicNote } from '@neoformuflash/contracts';

export async function PublicNoteCard({ handle, note }: { handle: string; note: PublicNote }) {
  const excerpt = note.contentText.length > 200
    ? note.contentText.slice(0, 200).trimEnd() + '…'
    : note.contentText;

  // The note lives under its author, not under its course: /@handle/note-slug.
  const noteUrl = `/@${handle}/${note.slug}` as Route;

  return (
    <Link
      href={noteUrl}
      className="flex flex-col gap-2 rounded-md border border-subtle bg-raised p-4 transition-colors ease-out hover:border-strong"
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="truncate text-ui-base font-semibold text-primary min-w-0">{note.title}</h3>
        {note.course ? (
          <span className="shrink-0 text-ui-xs tracking-ui text-tertiary uppercase">
            {note.course.name}
          </span>
        ) : null}
      </div>

      <p className="text-ui-sm text-secondary line-clamp-3">{excerpt}</p>

      <div className="flex items-center gap-3 text-ui-xs tracking-ui text-tertiary">
        <span className="uppercase">{note.language}</span>
        {note.publishedAt && (
          <time dateTime={note.publishedAt}>
            {new Date(note.publishedAt).toLocaleDateString(undefined, {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
            })}
          </time>
        )}
      </div>
    </Link>
  );
}