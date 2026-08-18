'use server';

import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getSessionUser } from '@/lib/supabase/session';
import { updateNoteSeo } from '@/lib/db/notes';
import { UpdateNoteSeoInput } from '@neoformuflash/contracts';

export async function updateNoteSeoAction(
  _prev: { ok: boolean; error?: string },
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const user = await getSessionUser();
  if (!user) redirect('/login');

  const t = await getTranslations('notes');

  const ogTitle = formData.get('ogTitle') as string | null;
  const ogDescription = formData.get('ogDescription') as string | null;
  const ogImageUrl = formData.get('ogImageUrl') as string | null;
  const noteId = formData.get('noteId') as string;

  const input: UpdateNoteSeoInput = {
    noteId,
    ogTitle: ogTitle === '' ? null : ogTitle,
    ogDescription: ogDescription === '' ? null : ogDescription,
    ogImageUrl: ogImageUrl === '' ? null : ogImageUrl,
  };

  const result = await updateNoteSeo(user.id, input);

  if (!result.ok) {
    return { ok: false, error: t(result.code) };
  }

  return { ok: true };
}