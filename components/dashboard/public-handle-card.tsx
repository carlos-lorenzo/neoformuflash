'use client';

// Client: the copy button needs an onClick and the clipboard API.

import { useTranslations } from 'next-intl';

function CopyIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className="size-4 icon-inline"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <rect x="3" y="3" width="10" height="10" rx="1.5" />
      <rect x="7" y="1" width="10" height="10" rx="1.5" />
    </svg>
  );
}

export function PublicHandleCard({ handle }: { handle: string }) {
  const t = useTranslations('dashboard');

  return (
    <div className="rounded-md border border-subtle bg-raised p-4">
      <p className="text-ui-sm font-semibold text-secondary">{t('publicProfileLabel')}</p>
      <div className="mt-2 flex items-center gap-2">
        <code className="flex-1 truncate rounded-sm bg-inset px-3 py-2 font-mono text-ui-sm text-secondary">
          {`@${handle}`}
        </code>
        <button
          type="button"
          onClick={() => navigator.clipboard.writeText(`@${handle}`)}
          aria-label={t('copyHandle')}
          className="flex size-8 items-center justify-center rounded-sm bg-inset text-secondary transition-colors hover:bg-subtle hover:text-primary"
        >
          <CopyIcon />
        </button>
      </div>
      <p className="mt-2 text-ui-xs text-tertiary">{t('publicProfileHint')}</p>
    </div>
  );
}
