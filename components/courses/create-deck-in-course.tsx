// Client: creates a draft deck inside a course. Uses the same createDeck
// server action as the decks page — courseId comes from a hidden field.

'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { createDeck } from '@/app/app/decks/actions';
import { Button } from '@/components/ui/button';

export function CreateDeckInCourse({ courseId }: { courseId: string }) {
  const t = useTranslations('courses');
  const [, formAction, pending] = useActionState(createDeck, { errors: {} });

  return (
    <form action={formAction}>
      <input type="hidden" name="title" value="" />
      <input type="hidden" name="courseId" value={courseId} />
      <Button variant="secondary" type="submit" loading={pending}>
        {t('detail.newDeck')}
      </Button>
    </form>
  );
}
