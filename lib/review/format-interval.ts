/**
 * Compact interval label for the grading row's mono column.
 *
 * Renders in Geist Mono, `tabular-nums` (design-system §2). Keep labels
 * compact enough to fit four side-by-side at 390px. The exact thresholds
 * are UI detail — not derived from FSRS or any math — so adjust freely
 * for layout needs as long as the label stays a single short token.
 */
export function formatInterval(days: number): string {
  if (!isFinite(days) || days < 0) return '<1 min';

  if (days === 0) return '<1 min';

  // Learning steps are minutes. schedule() returns dueAt as a Date; the
  // caller computes (dueAt − now) / msPerDay. A 1-min step ≈ 0.0007d;
  // a 10-min step ≈ 0.007d.
  if (days < 1 / 1440) return '<1 min'; // < 1 min

  if (days < 1 / 24) {
    const mins = Math.round(days * 1440);
    return `${mins} min`;
  }

  if (days < 1) {
    const hrs = Math.round(days * 24);
    return `${hrs}h`;
  }

  if (days < 30) {
    const d = Math.round(days);
    return `${d} d`;
  }

  if (days < 365) {
    const w = Math.round(days / 7);
    return `${w} w`;
  }

  const y = Math.round(days / 365);
  return `${y} y`;
}
