// Client: needs useActionState for the createNote server action.

'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { createNote } from '@/app/app/notes/actions';
import { Button } from '@/components/ui/button';

export function CreateNoteButton() {
  const t = useTranslations('notes');
  const [, formAction, pending] = useActionState(createNote, { errors: {} });

  return (
    <form action={formAction}>
      <input type="hidden" name="title" value="" />
      <Button variant="primary" type="submit" loading={pending}>
        {t('newNote')}
      </Button>
    </form>
  );
}
