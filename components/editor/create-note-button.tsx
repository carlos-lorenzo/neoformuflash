// Client: needs useActionState for the createNote server action.
//
// One-click draft from the notes list; with an optional courseId it becomes a
// course-scoped draft from the course detail page (phase-03b H).

'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { createNote } from '@/app/app/notes/actions';
import { Button } from '@/components/ui/button';

export function CreateNoteButton({ courseId }: { courseId?: string }) {
  const t = useTranslations('notes');
  const [, formAction, pending] = useActionState(createNote, { errors: {} });

  return (
    <form action={formAction}>
      <input type="hidden" name="title" value="" />
      {courseId ? <input type="hidden" name="courseId" value={courseId} /> : null}
      <Button variant="primary" type="submit" loading={pending}>
        {t('newNote')}
      </Button>
    </form>
  );
}
