// Server Component: a slim study-stats band. Two tiles per row from tablet up,
// a single column at 390px, so the four numbers form a compact 2×2 block on
// wide screens rather than four cells stretched across the page.

import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { BookOpenIcon, CheckIcon, ClockIcon, FireIcon } from '@/components/ui/icon';
import { cn } from '@/lib/cn';
import type { Streak } from '@/lib/db/decks';
import type { DayCount, TodayReviewStats } from '@/lib/db/stats';

type DashboardStatsProps = {
  streak: Streak | null;
  today: TodayReviewStats;
  /** Last 7 days, oldest first, today last. */
  activity: DayCount[];
  /** Total cards due now across the user's decks. */
  totalDue: number;
};

export async function DashboardStats({ streak, today, activity, totalDue }: DashboardStatsProps) {
  const t = await getTranslations('dashboard.stats');
  const minutes = Math.round(today.msToday / 60_000);
  const streakCurrent = streak?.current ?? 0;

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Metric label={t('streak')} icon={<FireIcon className="text-accent" />}>
        <p className="flex items-baseline gap-1">
          <span data-numeric className="text-ui-lg font-semibold text-primary">
            {streakCurrent}
          </span>
        </p>
        <HeatStrip
          days={activity}
          ariaLabel={t('heat', {
            active: activity.filter((d) => d.count > 0).length,
            total: activity.length,
          })}
        />
      </Metric>

      <Metric label={t('studied')} icon={<CheckIcon className="text-secondary" />}>
        <p>
          <span data-numeric className="text-ui-lg font-semibold text-primary">
            {today.reviewedToday}
          </span>
        </p>
      </Metric>

      <Metric label={t('time')} icon={<ClockIcon className="text-secondary" />}>
        <p className="flex items-baseline gap-1">
          <span data-numeric className="text-ui-lg font-semibold text-primary">
            {minutes}
          </span>
          <span className="text-ui-xs text-tertiary">{t('unitMin')}</span>
        </p>
      </Metric>

      <Metric label={t('due')} icon={<BookOpenIcon className="text-secondary" />}>
        <p>
          <span data-numeric className="text-ui-lg font-semibold text-primary">
            {totalDue}
          </span>
        </p>
      </Metric>
    </div>
  );
}

function Metric({
  label,
  icon,
  children,
}: {
  label: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-subtle bg-raised p-3">
      <span className="shrink-0 self-start text-secondary">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-ui-xs font-medium uppercase tracking-eyebrow text-tertiary">{label}</p>
        <div className="mt-1">{children}</div>
      </div>
    </div>
  );
}

function HeatStrip({ days, ariaLabel }: { days: DayCount[]; ariaLabel: string }) {
  return (
    <div role="img" aria-label={ariaLabel} className="mt-1 flex items-center gap-1">
      {days.map((day) => (
        <span
          key={day.date.toISOString()}
          aria-hidden="true"
          title={day.date.toISOString().slice(0, 10)}
          className={cn('h-2 flex-1 rounded-full', day.count > 0 ? 'bg-accent' : 'bg-inset')}
        />
      ))}
    </div>
  );
}
