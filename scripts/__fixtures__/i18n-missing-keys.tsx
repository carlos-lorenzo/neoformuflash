/*
 * FIXTURE for scripts/lint-i18n.test.ts — the key-resolution checks.
 *
 * Each line deliberately triggers exactly one of the four new checks.
 * The test asserts an exact finding count, so adding a case means updating
 * the count too.
 *
 * - Missing key:          t('no.such.key') under review namespace
 * - Template prefix:      t(`nonexistent.${x}`) — no catalog leaf under 'review.nonexistent.'
 * - Shortcut no label:    useShortcut('review', 'x', fn) — no options
 * - Shortcut bad label:   useShortcut('review', 'y', fn, { label: 'gradeHard' }) — not a root key
 * - Negative:             t(`grade.${rating}`) — prefix has leaves (review.grade.*), must NOT fire
 * - Unresolvable t:       tc('some.key') — tc is not bound, flagged as unresolvable
 */
export function MissingKeys() {
  const t = useTranslations('review');

  // Missing key under a bound namespace — fires.
  const a = t('no.such.key');

  // Template prefix with no catalog leaves — fires.
  const b = t(`nonexistent.${something}`);

  // Template prefix that IS fine — must NOT fire.
  const c = t(`grade.${rating}`);

  // Shortcut with no options — fires.
  useShortcut('review', 'x', () => {});

  // Shortcut with a label that is not a root key — fires.
  useShortcut('review', 'y', () => {}, { label: 'gradeHard' });

  // Unresolvable: tc is not bound anywhere — fires.
  const d = tc('some.key');
}
