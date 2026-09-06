'use client';

import { useForm } from 'react-hook-form';
import { useRouter } from 'next/navigation';
import { startTransition, useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { updateNoteSeoAction } from '@/app/app/notes/[id]/seo/actions';
import { cn } from '@/lib/cn';

export interface SeoFields {
  ogTitle: string;
  ogDescription: string;
  ogImageUrl: string;
}

interface SeoFormState {
  ok: boolean;
  error?: string;
}

export function SeoForm({
  noteId,
  initial,
}: {
  noteId: string;
  initial: SeoFields;
}) {
  const router = useRouter();
  const t = useTranslations('notes.seo');
  // Server-action failures come back as global catalog keys (error.unexpected),
  // translated here from the default scope.
  const tg = useTranslations();

  const message = (key: string | undefined) => (key ? tg(key) /* i18n-dynamic-key */ : undefined);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<SeoFields>({
    defaultValues: initial,
  });

  const [state, formAction] = useActionState<SeoFormState, FormData>(
    async (_prev: SeoFormState, formData: FormData) => {
      const result = await updateNoteSeoAction(_prev, formData);
      return result as SeoFormState;
    },
    { ok: false, error: undefined },
  );

  const onSubmit = handleSubmit(async (data) => {
    const formData = new FormData();
    formData.append('noteId', noteId);
    formData.append('ogTitle', data.ogTitle);
    formData.append('ogDescription', data.ogDescription);
    formData.append('ogImageUrl', data.ogImageUrl);
    // The action is invoked from a click handler rather than a native form
    // submit, so it must run inside a transition for React to track pending.
    startTransition(() => {
      formAction(formData);
    });
  });

  if (state.ok && !isSubmitting && isDirty) {
    // Refresh to get updated SEO data
    router.refresh();
  }

  return (
    <details className="rounded-md border border-subtle">
      <summary className="flex items-center justify-between cursor-pointer select-none p-4">
        <span className="text-ui-sm font-semibold text-secondary">{t('title')}</span>
        <span className="text-ui-xs text-tertiary">›</span>
      </summary>
      <div className="p-4 border-t border-subtle space-y-4">
        <p className="text-ui-sm text-tertiary">{t('description')}</p>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="ogTitle"
              className="mb-1 block text-ui-sm font-medium text-secondary"
            >
              {t('ogTitleLabel')}
            </label>
            <input
              {...register('ogTitle', {
                maxLength: 120,
              })}
              id="ogTitle"
              type="text"
              maxLength={120}
              placeholder={t('ogTitlePlaceholder')}
              className={cn(
                'w-full rounded-sm border px-3 py-2 text-ui-base',
                'bg-base border-subtle placeholder:text-tertiary',
                'focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent-quiet',
                errors.ogTitle && 'border-danger',
              )}
              aria-invalid={errors.ogTitle ? 'true' : 'false'}
              aria-describedby={errors.ogTitle ? 'ogTitle-error' : undefined}
            />
            {errors.ogTitle && (
              <p id="ogTitle-error" className="mt-1 text-ui-xs text-danger">
                {errors.ogTitle.message as string}
              </p>
            )}
          </div>

          <div>
            <label
              htmlFor="ogDescription"
              className="mb-1 block text-ui-sm font-medium text-secondary"
            >
              {t('ogDescriptionLabel')}
            </label>
            <textarea
              {...register('ogDescription', {
                maxLength: 255,
              })}
              id="ogDescription"
              maxLength={255}
              rows={3}
              placeholder={t('ogDescriptionPlaceholder')}
              className={cn(
                'w-full rounded-sm border px-3 py-2 text-ui-base',
                'bg-base border-subtle placeholder:text-tertiary',
                'focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent-quiet',
                errors.ogDescription && 'border-danger',
              )}
              aria-invalid={errors.ogDescription ? 'true' : 'false'}
              aria-describedby={errors.ogDescription ? 'ogDescription-error' : undefined}
            />
            {errors.ogDescription && (
              <p id="ogDescription-error" className="mt-1 text-ui-xs text-danger">
                {errors.ogDescription.message as string}
              </p>
            )}
          </div>

          <div>
            <label
              htmlFor="ogImageUrl"
              className="mb-1 block text-ui-sm font-medium text-secondary"
            >
              {t('ogImageUrlLabel')}
            </label>
            <input
              {...register('ogImageUrl', {
                pattern: /^https:\/\//,
                maxLength: 2048,
              })}
              id="ogImageUrl"
              type="url"
              maxLength={2048}
              placeholder={t('ogImageUrlPlaceholder')}
              className={cn(
                'w-full rounded-sm border px-3 py-2 text-ui-base',
                'bg-base border-subtle placeholder:text-tertiary',
                'focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent-quiet',
                errors.ogImageUrl && 'border-danger',
              )}
              aria-invalid={errors.ogImageUrl ? 'true' : 'false'}
              aria-describedby={errors.ogImageUrl ? 'ogImageUrl-error' : undefined}
            />
            {errors.ogImageUrl && (
              <p id="ogImageUrl-error" className="mt-1 text-ui-xs text-danger">
                {t('ogImageUrlError')}
              </p>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={!isDirty || isSubmitting}
              className={cn(
                'rounded-sm px-4 py-2 text-ui-base font-medium transition-colors',
                'focus:outline-none focus:ring-2 focus:ring-accent-quiet',
                isSubmitting
                  ? 'bg-accent/50 text-on-accent cursor-wait'
                  : isDirty
                    ? 'bg-accent text-on-accent hover:bg-accent-hover'
                    : 'bg-inset text-tertiary cursor-not-allowed',
              )}
            >
              {isSubmitting ? t('savingButton') : t('saveButton')}
            </button>

            {state.ok && (
              <span className="text-ui-sm text-success" role="status">
                {t('saved')}
              </span>
            )}

            {!state.ok && state.error && (
              <span className="text-ui-sm text-danger" role="alert">
                {message(state.error)}
              </span>
            )}
          </div>
        </form>
      </div>
    </details>
  );
}