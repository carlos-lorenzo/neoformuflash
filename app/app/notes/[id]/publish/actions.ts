'use server';

import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getSessionUser } from '@/lib/supabase/session';
import { setNotePublished } from '@/lib/db/notes';

export type PublishNoteState = {
  ok: boolean;
  error?: string;
};

export async function publishNoteAction(
  _prev: PublishNoteState,
  formData: FormData
): Promise<PublishNoteState> {
  const user = await getSessionUser();
  if (!user) redirect('/login');

  const t = await getTranslations('notes');

  const noteId = formData.get('noteId') as string;
  const action = formData.get('action') as 'publish' | 'unpublish';

  if (!noteId || !action) {
    return { ok: false, error: t('error.unexpected') };
  }

  const publishedAt = action === 'publish' ? new Date().toISOString() : null;

  const result = await setNotePublished(user.id, noteId, publishedAt);

  if (!result.ok) {
    return { ok: false, error: result.code };
  }

  return { ok: true };
}