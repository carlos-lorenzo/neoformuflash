// Client: four grading buttons with interval previews in mono beneath.
// ≥44px targets at 390px; color coding: --danger/--warning/--text-secondary/--success.

'use client';

import { useTranslations } from 'next-intl';
import { cn } from '@/lib/cn';

export type GradingRowProps = {
  previews: Record<'again' | 'hard' | 'good' | 'easy', string>;
  onGrade: (rating: 'again' | 'hard' | 'good' | 'easy') => void;
  disabled?: boolean;
  loadingRating?: 'again' | 'hard' | 'good' | 'easy' | null;
};

const RATINGS: Array<'again' | 'hard' | 'good' | 'easy'> = ['again', 'hard', 'good', 'easy'];

const RATING_VARIANT: Record<'again' | 'hard' | 'good' | 'easy', string> = {
  again: 'bg-danger text-on-accent hover:opacity-90',
  hard: 'bg-warning text-on-accent hover:opacity-90',
  good: 'bg-transparent text-secondary hover:bg-raised hover:text-primary',
  easy: 'bg-success text-on-accent hover:opacity-90',
};

export function GradingRow({
  previews,
  onGrade,
  disabled = false,
  loadingRating,
}: GradingRowProps) {
  const t = useTranslations('review');

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-4 gap-2" role="group" aria-label={t('grade.label')}>
        {RATINGS.map((rating) => (
          <button
            key={rating}
            type="button"
            onClick={() => !disabled && onGrade(rating)}
            disabled={disabled}
            className={cn(
              'flex flex-col items-center gap-1 rounded-md px-2 py-3 text-ui-sm font-medium transition-colors ease-out',
              'min-h-11 min-w-11', // ≥44px touch target at 390px (§6)
              RATING_VARIANT[rating],
              {
                'opacity-50 pointer-events-none': disabled || loadingRating !== null,
                'ring-2 ring-offset-2 ring-accent': loadingRating === rating,
              }
            )}
          >
            <span>{t(`grade.${rating}`)}</span>
            <span className="text-ui-xs font-mono tabular-nums text-tertiary">
              {previews[rating]}
            </span>
          </button>
        ))}
      </div>

      <div className="text-center text-ui-xs tracking-ui text-tertiary">
        {t('shortcutHint')}
      </div>
    </div>
  );
}