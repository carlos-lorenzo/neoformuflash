/**
 * Human-friendly "next session due" rendering for the empty review state.
 *
 * Pure function of (dueIso, now) so it is unit-testable without a clock mock
 * beyond passing `now`. Returns a short relative phrase ("in 12 minutes")
 * plus the absolute local date-time for the title attribute / screen readers.
 */
export function formatNextDue(
  dueIso: string,
  now: Date = new Date(),
): { relative: string; absolute: string } {
  const due = new Date(dueIso);
  const absolute = due.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

  const ms = due.getTime() - now.getTime();
  if (Number.isNaN(due.getTime())) return { relative: absolute, absolute };
  if (ms <= 0) return { relative: 'now', absolute };

  const minutes = Math.round(ms / 60_000);
  if (minutes < 1) return { relative: 'in less than a minute', absolute };
  if (minutes < 60) {
    return {
      relative: minutes === 1 ? 'in 1 minute' : `in ${minutes} minutes`,
      absolute,
    };
  }
  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return { relative: hours === 1 ? 'in 1 hour' : `in ${hours} hours`, absolute };
  }
  const days = Math.round(hours / 24);
  if (days < 7) {
    return { relative: days === 1 ? 'tomorrow' : `in ${days} days`, absolute };
  }
  return { relative: `on ${absolute}`, absolute };
}
