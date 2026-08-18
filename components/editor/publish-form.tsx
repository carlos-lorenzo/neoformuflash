'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { publishNoteAction } from '@/app/app/notes/[id]/publish/actions';

interface PublishFormState {
  ok: boolean;
  error?: string;
}

export function PublishForm({
  noteId,
  isPublished,
}: {
  noteId: string;
  isPublished: boolean;
}) {
  const t = useTranslations('notes.publish');

  const [state, formAction] = useActionState<PublishFormState, FormData>(
    async (_prev: PublishFormState, formData: FormData) => {
      const result = await publishNoteAction(_prev, formData);
      return result as PublishFormState;
    },
    { ok: false, error: undefined },
  );

  const onSubmit = async (action: 'publish' | 'unpublish') => {
    const formData = new FormData();
    formData.append('noteId', noteId);
    formData.append('action', action);
    await formAction(formData);
  };

  return (
    <details className="rounded-md border border-subtle">
      <summary className="flex items-center justify-between cursor-pointer select-none p-4">
        <span className="text-ui-sm font-semibold text-secondary">
          {isPublished ? t('unpublishButton') : t('publishButton')}
        </span>
        <span className="text-ui-xs text-tertiary">›</span>
      </summary>
      <div className="p-4 space-y-4 border-t border-subtle">
        <p className="text-ui-sm text-tertiary">
          {isPublished ? t('unpublishDesc') : t('publishDesc')}
        </p>
        <div className="flex gap-2">
          {!isPublished && (
            <button
              type="button"
              onClick={() => onSubmit('publish')}
              disabled={state.ok}
              className="flex-1 rounded-md bg-accent px-3 py-2 text-ui-sm font-medium text-primary hover:bg-accent-hover disabled:opacity-50"
            >
              {state.ok ? t('published') : t('publishButton')}
            </button>
          )}
          {isPublished && (
            <button
              type="button"
              onClick={() => onSubmit('unpublish')}
              disabled={state.ok}
              className="flex-1 rounded-md bg-inset px-3 py-2 text-ui-sm font-medium text-secondary hover:bg-subtle disabled:opacity-50"
            >
              {state.ok ? t('unpublished') : t('unpublishButton')}
            </button>
          )}
        </div>
        {state.error && (
          <p className="text-ui-sm text-danger" role="alert">
            {state.error}
          </p>
        )}
      </div>
    </details>
  );
}