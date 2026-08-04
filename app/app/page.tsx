import { getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';

// Server Component: the dashboard is an empty state and nothing more this phase.

export default async function DashboardPage() {
  const t = await getTranslations('app.empty');

  return (
    <EmptyState
      title={t('title')}
      body={t('body')}
      icon={<NotebookMark />}
      action={
        // Exactly one action (§7).
        <Button variant="primary">{t('action')}</Button>
      }
    />
  );
}

/* A subdued monochrome wireframe mark, never a full-colour illustration. */
function NotebookMark() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 32 32"
      className="size-8"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.25"
    >
      <rect x="6.5" y="3.5" width="19" height="25" rx="2" />
      <path d="M11.5 3.5v25" />
      <path d="M15 10h7M15 15h7M15 20h4" strokeLinecap="round" />
    </svg>
  );
}
