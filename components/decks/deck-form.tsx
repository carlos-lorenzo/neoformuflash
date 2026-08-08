// Client: form state, validation display and submission for deck create/edit.

'use client';

import { useActionState, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { createDeck, saveDeck } from '@/app/app/decks/actions';

export type DeckFormProps = {
  /** When provided, this is the edit form for an existing deck. */
  deck?: {
    id: string;
    title: string;
    visibility: string;
    desiredRetention: number | null;
    newCardsPerDay: number;
  };
};

export function DeckForm({ deck }: DeckFormProps) {
  const t = useTranslations('decks');

  const [title, setTitle] = useState(deck?.title ?? '');
  const [visibility, setVisibility] = useState(deck?.visibility ?? 'public');
  const [retention, setRetention] = useState(
    deck?.desiredRetention != null ? String(deck.desiredRetention) : '',
  );
  const [newPerDay, setNewPerDay] = useState(String(deck?.newCardsPerDay ?? 20));

  // Create flow uses a hidden title field (same as notes); edit flow uses saveDeck.
  const [, createAction, createPending] = useActionState(createDeck, { errors: {} });
  const [saveState, saveAction, savePending] = useActionState(saveDeck, {});

  const isEdit = Boolean(deck);

  function submitAction() {
    if (isEdit) {
      const fd = new FormData();
      fd.set('id', deck!.id);
      fd.set('title', title);
      fd.set('visibility', visibility);
      if (retention !== '') fd.set('desiredRetention', retention);
      fd.set('newCardsPerDay', newPerDay);
      return saveAction(fd);
    }
    const fd = new FormData();
    fd.set('title', title);
    return createAction(fd);
  }

  return (
    <form action={submitAction} className="flex flex-col gap-4">
      <Input
        label={t('form.title')}
        placeholder={t('form.titlePlaceholder')}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        name="title"
      />

      <Select
        label={t('form.visibility')}
        placeholder={t('form.visibility')}
        value={visibility}
        onValueChange={setVisibility}
        name="visibility"
        emptyLabel=""
        options={[
          { value: 'public', label: t('form.visibilityPublic') },
          { value: 'unlisted', label: t('form.visibilityUnlisted') },
          { value: 'private', label: t('form.visibilityPrivate') },
        ]}
      />

      <Input
        label={t('form.desiredRetention')}
        hint={t('form.desiredRetentionHint')}
        value={retention}
        onChange={(e) => setRetention(e.target.value)}
        inputMode="decimal"
        placeholder="0.90"
        name="desiredRetention"
      />

      <Input
        label={t('form.newCardsPerDay')}
        value={newPerDay}
        onChange={(e) => setNewPerDay(e.target.value)}
        inputMode="numeric"
        name="newCardsPerDay"
      />

      {saveState.errors?.form ? (
        <p className="text-ui-sm text-danger">{saveState.errors.form}</p>
      ) : null}

      <div className="flex justify-end">
        <Button
          variant="primary"
          type="submit"
          loading={createPending || savePending}
          onClick={() => undefined}
        >
          {t('form.submit')}
        </Button>
      </div>
    </form>
  );
}
