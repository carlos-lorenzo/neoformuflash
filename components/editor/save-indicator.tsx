// Client: shows the autosave lifecycle: idle → saving → saved → error.
// Also handles the offline state. Uses useTranslations for all labels.

'use client';

import { useTranslations } from 'next-intl';
import { cn } from '@/lib/cn';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error' | 'offline';

type SaveIndicatorProps = {
  status: SaveStatus;
  onRetry?: () => void;
};

export function SaveIndicator({ status, onRetry }: SaveIndicatorProps) {
  const t = useTranslations('editor');
  const tc = useTranslations('common');

  if (status === 'idle') return null;

  return (
    <div
      aria-live="polite"
      className={cn(
        'duration-instant flex items-center gap-2 text-ui-sm transition-colors ease-out',
        status === 'saving' && 'text-tertiary',
        status === 'saved' && 'text-success',
        status === 'error' && 'text-danger',
        status === 'offline' && 'text-warning',
      )}
    >
      {status === 'saving' && <span>{tc('saving')}</span>}
      {status === 'saved' && <span>{t('saved')}</span>}
      {status === 'error' && (
        <>
          <span>{t('saveFailed')}</span>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="text-ui-sm text-danger underline-offset-2 hover:underline"
            >
              {t('retry')}
            </button>
          )}
        </>
      )}
      {status === 'offline' && <span>{t('offline')}</span>}
    </div>
  );
}
