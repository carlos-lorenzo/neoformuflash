import { notFound, redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getSessionUser } from '@/lib/supabase/session';
import { getNote } from '@/lib/db/notes';
import { NoteEditor } from '@/components/editor/note-editor';

export default async function NotePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect('/login');

  const { id } = await params;
  const result = await getNote(user.id, id);

  if (!result.ok) {
    const t = await getTranslations('notes');
    return <p className="text-ui-base text-danger">{t('error')}</p>;
  }

  if (!result.value) notFound();

  return <NoteEditor note={result.value} />;
}
