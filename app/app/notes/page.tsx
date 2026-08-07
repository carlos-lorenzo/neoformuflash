import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/supabase/session';
import { getNotes } from '@/lib/db/notes';
import { NoteList } from '@/components/editor/note-list';

export default async function NotesPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');

  const t = await getTranslations('notes');
  const result = await getNotes(user.id);

  // A DB failure during list is unexpected — surface as a generic error.
  if (!result.ok) {
    return (
      <p className="text-ui-base text-danger">{t('error')}</p>
    );
  }

  return <NoteList notes={result.value} />;
}
