// Client: uses useActionState for the createCourse server action.

'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { createCourse } from '@/app/app/courses/actions';
import { Button } from '@/components/ui/button';

export function CreateCourseButton() {
  const t = useTranslations('courses');
  const [, formAction, pending] = useActionState(createCourse, { errors: {} });

  return (
    <form action={formAction}>
      <input type="hidden" name="name" value="" />
      <Button variant="primary" type="submit" loading={pending}>
        {t('createCourse')}
      </Button>
    </form>
  );
}
