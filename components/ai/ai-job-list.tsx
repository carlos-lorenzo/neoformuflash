'use client';

import { useTranslations } from 'next-intl';
import { cn } from '@/lib/cn';

interface AiJobListProps {
  jobs: {
    id: string;
    kind: string;
    status: string;
    inputTokens: number | null;
    outputTokens: number | null;
    error: string | null;
    createdAt: string;
  }[];
}

export function AiJobList({ jobs }: AiJobListProps) {
  const t = useTranslations('ai.jobs');

  if (jobs.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-tertiary">{t('empty')}</p>
      </div>
    );
  }

  return (
    <dl className="space-y-2">
      {jobs.map((job) => (
        <div
          key={job.id}
          className={cn(
            'flex items-center justify-between p-3 rounded-lg border border-subtle bg-raised',
            job.status === 'error' && 'border-danger/50'
          )}
        >
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-ui-sm font-medium truncate">
              {t(`kind.${job.kind as 'pdf_to_notes' | 'copilot' | 'notes_to_cards'}`) || job.kind}
            </span>
            <span
              className={cn(
                'px-2 py-1 rounded text-ui-xs font-mono',
                job.status === 'done' && 'bg-success/20 text-success',
                job.status === 'running' && 'bg-warning/20 text-warning',
                job.status === 'pending' && 'bg-accent/20 text-accent',
                job.status === 'error' && 'bg-danger/20 text-danger'
              )}
            >
              {t(`status.${job.status}`) || job.status}
            </span>
          </div>
          <div className="flex items-center gap-4 text-ui-sm text-tertiary whitespace-nowrap">
            <span>{job.inputTokens !== null ? `${job.inputTokens} in` : '—'}</span>
            <span>{job.outputTokens !== null ? `${job.outputTokens} out` : '—'}</span>
            <time dateTime={job.createdAt}>
              {new Date(job.createdAt).toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </time>
          </div>
        </div>
      ))}
    </dl>
  );
}