// Client: form state, validation display and submission for course create/edit.

'use client';

import { useActionState, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { createCourse, saveCourse } from '@/app/app/courses/actions';

export type CourseFormProps = {
  /** When provided, this is the edit form for an existing course. */
  course?: {
    id: string;
    name: string;
    code: string | null;
    language: string;
    visibility: string;
  };
};

export function CourseForm({ course }: CourseFormProps) {
  const t = useTranslations('courses');
  const tl = useTranslations('locale');

  const [name, setName] = useState(course?.name ?? '');
  const [code, setCode] = useState(course?.code ?? '');
  const [language, setLanguage] = useState(course?.language ?? 'es');
  const [visibility, setVisibility] = useState(course?.visibility ?? 'public');

  const [, createAction, createPending] = useActionState(createCourse, { errors: {} });
  const [saveState, saveAction, savePending] = useActionState(saveCourse, { errors: {} });

  const isEdit = Boolean(course);

  function submitAction() {
    const fd = new FormData();
    if (isEdit) fd.set('id', course!.id);
    fd.set('name', name);
    fd.set('code', code);
    fd.set('language', language);
    fd.set('visibility', visibility);
    if (isEdit) return saveAction(fd);
    return createAction(fd);
  }

  // Form-level errors arrive as catalog keys. Resolve the known ones with
  // static t() calls — a dynamic t(code) is invisible to lint:i18n's key
  // existence check (plan risk #4). Field-level zod codes are passed to
  // Input as the error prop, matching the decks form.
  const errorCode = saveState.errors?.form;
  const formError = errorCode
    ? errorCode === 'course.privateRequiresPro'
      ? t('privateRequiresPro')
      : t('form.saveFailed')
    : null;

  return (
    <form action={submitAction} className="flex flex-col gap-4">
      <Input
        label={t('form.name')}
        placeholder={t('form.namePlaceholder')}
        value={name}
        onChange={(e) => setName(e.target.value)}
        name="name"
        error={saveState.errors?.name}
      />

      <Input
        label={t('form.code')}
        hint={t('form.codeHint')}
        placeholder={t('form.codePlaceholder')}
        value={code}
        onChange={(e) => setCode(e.target.value)}
        name="code"
      />

      <Select
        label={t('form.language')}
        placeholder={t('form.language')}
        value={language}
        onValueChange={setLanguage}
        name="language"
        emptyLabel=""
        options={[
          { value: 'es', label: tl('es') },
          { value: 'en', label: tl('en') },
        ]}
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

      {formError ? (
        <p className="text-ui-sm text-danger">{formError}</p>
      ) : null}

      <Button variant="primary" type="submit" loading={isEdit ? savePending : createPending}>
        {isEdit ? t('form.save') : t('form.submit')}
      </Button>
    </form>
  );
}
