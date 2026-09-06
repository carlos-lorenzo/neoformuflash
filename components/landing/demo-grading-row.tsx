// Presentational clone of components/review/grading-row.tsx for the landing
// demo — same four grading buttons, same colour coding, same mono interval
// previews. The copy arrives via props so the demo never reaches into the
// app's review catalogue.

import { cn } from '@/lib/cn';

export type Rating = 'again' | 'hard' | 'good' | 'easy';

export type DemoGradingRowProps = {
  labels: Record<Rating, string>;
  previews: Record<Rating, string>;
  /** Accessible name for the button group. */
  ariaLabel: string;
  shortcutHint: string;
  onGrade: (rating: Rating) => void;
  disabled?: boolean;
};

const RATINGS: Rating[] = ['again', 'hard', 'good', 'easy'];

const RATING_VARIANT: Record<Rating, string> = {
  again: 'bg-danger text-on-accent hover:opacity-90',
  hard: 'bg-warning text-on-accent hover:opacity-90',
  good: 'bg-transparent text-secondary hover:bg-raised hover:text-primary',
  easy: 'bg-success text-on-accent hover:opacity-90',
};

export function DemoGradingRow({
  labels,
  previews,
  ariaLabel,
  shortcutHint,
  onGrade,
  disabled = false,
}: DemoGradingRowProps) {
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-4 gap-2" role="group" aria-label={ariaLabel}>
        {RATINGS.map((rating) => (
          <button
            key={rating}
            type="button"
            onClick={() => !disabled && onGrade(rating)}
            disabled={disabled}
            className={cn(
              'flex min-h-11 min-w-11 flex-col items-center gap-2 rounded-md px-2 py-4 text-ui-sm font-medium transition-colors ease-out',
              RATING_VARIANT[rating],
              { 'pointer-events-none opacity-50': disabled }
            )}
          >
            <span>{labels[rating]}</span>
            <span className="text-ui-sm mb-1 font-mono tabular-nums">
              {previews[rating]}
            </span>
          </button>
        ))}
      </div>

      <div className="text-center text-ui-xs tracking-ui text-tertiary">{shortcutHint}</div>
    </div>
  );
}
