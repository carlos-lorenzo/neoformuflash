// Client: form state, validation display and submission for deck create/edit.

'use client';

import { useActionState, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { CoursePicker } from '@/components/courses/course-picker';
import type { CourseSummary } from '@/lib/db/courses';
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
  /**
   * The user's courses for the create-flow course picker (phase-03b H).
   * Course-first is a UX affordance, not a DB invariant — the picker offers an
   * explicit "no course" option and the field stays nullable.
   */
  courses?: CourseSummary[];
};

export function DeckForm({ deck, courses }: DeckFormProps) {
  const t = useTranslations('decks');
  const searchParams = useSearchParams();

  const [title, setTitle] = useState(deck?.title ?? '');
  const [visibility, setVisibility] = useState(deck?.visibility ?? 'public');
  const [courseId, setCourseId] = useState(searchParams.get('courseId') ?? '');
  const [retention, setRetention] = useState(
    deck?.desiredRetention != null ? String(deck.desiredRetention) : '',
  );
  const [newPerDay, setNewPerDay] = useState(String(deck?.newCardsPerDay ?? 20));

  // Create flow uses a hidden title field (same as notes); edit flow uses saveDeck.
  const [, createAction, createPending] = useActionState(createDeck, { errors: {} });
  const [saveState, saveAction, savePending] = useActionState(saveDeck, {});

  const isEdit = Boolean(deck);
  const hasCourseSelected = courseId !== '' || isEdit;
  const isCreateFlow = !isEdit;

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
    if (courseId) fd.set('courseId', courseId);
    return createAction(fd);
  }

  // Step 1: Course picker (no course selected yet, create flow)
  if (isCreateFlow && !hasCourseSelected) {
    return (
      <form action={submitAction} className="flex flex-col gap-6">
        <div className="text-center py-8">
          <h2 className="mb-2 text-ui-lg font-semibold text-primary">{t('create.chooseCourse')}</h2>
          <p className="text-ui-sm text-secondary">{t('create.createCourseFirst')}</p>
        </div>
        <CoursePicker courses={courses ?? []} value={courseId} onValueChange={setCourseId} />
        <div className="flex justify-end pt-4">
          <Button variant="primary" type="submit" loading={createPending} disabled={!courseId}>
            {t('form.submit')}
          </Button>
        </div>
      </form>
    );
  }

  // Step 2: Title + settings (course selected, or edit flow)
  return (
    <form action={submitAction} className="flex flex-col gap-4">
      <Input
        label={t('form.title')}
        placeholder={t('form.titlePlaceholder')}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        name="title"
        autoFocus
      />

      {!isEdit && courses ? (
        <CoursePicker courses={courses} value={courseId} onValueChange={setCourseId} />
      ) : null}

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

      <details className="group">
        <summary className="flex items-center justify-between cursor-pointer select-none">
          <span className="text-ui-sm font-medium text-secondary">{t('detail.settings')}</span>
          <span className="text-ui-xs text-tertiary transition-transform open:rotate-90">›</span>
        </summary>
        <div className="mt-4 flex flex-col gap-4">
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
        </div>
      </details>

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