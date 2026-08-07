import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/supabase/session';
import { getNotes } from '@/lib/db/notes';
import { EmptyState } from '@/components/ui/empty-state';

// Server Component: the dashboard shows recent notes for returning users,
// and a welcoming empty state for first-time visitors.

export default async function DashboardPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');

  const t = await getTranslations('app.empty');
  const tn = await getTranslations('notes');
  const result = await getNotes(user.id);

  // DB failure during note fetch is unexpected — surface the empty state.
  const notes = result.ok ? result.value : [];

  if (notes.length === 0) {
    return (
      <EmptyState
        title={t('title')}
        body={t('body')}
        icon={<NotebookMark />}
        action={
          <Link
            href="/app/notes"
            className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-accent px-3 text-ui-base font-medium text-on-accent transition-colors ease-out hover:bg-accent-hover"
          >
            {t('action')}
          </Link>
        }
      />
    );
  }

  const recent = notes.slice(0, 5);

  return (
    <div className="flex flex-col gap-6 py-2">
      <h1 className="text-ui-xl font-semibold text-primary">{tn('listTitle')}</h1>
      <ul className="flex flex-col divide-y divide-subtle">
        {recent.map((note) => (
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
      {notes.length > 5 ? (
        <Link
          href="/app/notes"
          className="text-ui-sm text-accent hover:underline"
        >
          {tn('listTitle')}
        </Link>
      ) : null}
    </div>
  );
}

/* A subdued monochrome wireframe mark, never a full-colour illustration. */
function NotebookMark() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 32 32"
      className="size-8"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.25"
    >
      <rect x="6.5" y="3.5" width="19" height="25" rx="2" />
      <path d="M11.5 3.5v25" />
      <path d="M15 10h7M15 15h7M15 20h4" strokeLinecap="round" />
    </svg>
  );
}
