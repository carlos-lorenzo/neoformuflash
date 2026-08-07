// Client: uses useActionState for the createDeck server action.

'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { createDeck } from '@/app/app/decks/actions';
import { Button } from '@/components/ui/button';

export function CreateDeckButton() {
  const t = useTranslations('decks');
  const [, formAction, pending] = useActionState(createDeck, { errors: {} });

  return (
    <form action={formAction}>
      <input type="hidden" name="title" value="" />
      <Button variant="primary" type="submit" loading={pending}>
        {t('createDeck')}
      </Button>
    </form>
  );
}
