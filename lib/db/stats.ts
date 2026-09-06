/**
 * Dashboard study stats.
 *
 * Everything is derived from review_logs, which is append-only and RLS-scoped
 * to the caller (review_logs_select_own, 0007), plus the streaks row that the
 * bump_streak trigger (0010) maintains atomically with each review.
 *
 * Day boundaries are UTC dates, matching bump_streak: "Day" is
 * reviewed_at::date there, so a dashboard that sliced on the server's local
 * midnight would disagree with the streak it sits next to.
 */

import { err, ok, type Result } from '@/lib/result';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export type TodayReviewStats = {
  /** Reviews logged since the start of the current UTC day. */
  reviewedToday: number;
  /** Sum of per-review elapsed_ms for the current UTC day. */
  msToday: number;
};

export type DayCount = {
  date: Date;
  count: number;
};

/** Start of the UTC day that `d` falls on. */
function utcDayStart(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/**
 * Reviews logged since the start of the current UTC day, and their summed
 * time. One range query over the review_logs_user_time_idx index.
 */
export async function getTodayReviewStats(userId: string): Promise<Result<TodayReviewStats>> {
  const supabase = await createSupabaseServerClient();
  const start = utcDayStart(new Date());

  const { data, error } = await supabase
    .from('review_logs')
    .select('reviewed_at, elapsed_ms')
    .eq('user_id', userId)
    .gte('reviewed_at', start.toISOString());

  if (error) return err('error.unexpected', error);

  let reviewedToday = 0;
  let msToday = 0;
  for (const row of data ?? []) {
    reviewedToday += 1;
    msToday += row.elapsed_ms ?? 0;
  }

  return ok({ reviewedToday, msToday });
}

/**
 * Review counts per UTC day for the trailing `days` days, oldest first, with
 * today as the last entry. Days with no reviews have count 0, so the caller
 * can render a full-length heat strip without padding logic.
 */
export async function getRecentDayCounts(
  userId: string,
  days = 7,
): Promise<Result<DayCount[]>> {
  const supabase = await createSupabaseServerClient();
  const today = utcDayStart(new Date());
  const from = new Date(today.getTime() - (days - 1) * 86_400_000);

  const { data, error } = await supabase
    .from('review_logs')
    .select('reviewed_at')
    .eq('user_id', userId)
    .gte('reviewed_at', from.toISOString())
    .lt('reviewed_at', new Date(today.getTime() + 86_400_000).toISOString());

  if (error) return err('error.unexpected', error);

  const byDay = new Map<string, number>();
  for (const row of data ?? []) {
    const day = row.reviewed_at.slice(0, 10); // YYYY-MM-DD, UTC
    byDay.set(day, (byDay.get(day) ?? 0) + 1);
  }

  const counts: DayCount[] = [];
  for (let i = 0; i < days; i += 1) {
    const date = new Date(from.getTime() + i * 86_400_000);
    const key = date.toISOString().slice(0, 10);
    counts.push({ date, count: byDay.get(key) ?? 0 });
  }

  return ok(counts);
}
