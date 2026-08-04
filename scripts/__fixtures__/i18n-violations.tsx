/*
 * FIXTURE for scripts/lint-i18n.test.ts. Excluded from tsconfig and eslint.
 *
 * The negative cases matter more than the positive ones. A linter that flags
 * `·` or a `className` string gets a blanket ignore added within a week, and
 * then it is enforcing nothing while still appearing in CI as a green step.
 */
declare const t: (key: string) => string;

export function Violations() {
  return (
    <div className="flex items-center gap-2" data-testid="not-language">
      {/* SHOULD FLAG: literal text a user reads */}
      <p>Sign in to continue</p>

      {/* SHOULD FLAG: literals in user-visible attributes */}
      <input placeholder="Search your notes" aria-label="Note search" />
      <img src="/a.png" alt="A worked derivation" />

      {/* SHOULD NOT FLAG: read from the catalog */}
      <p>{t('login.title')}</p>
      <input placeholder={t('login.placeholder')} />

      {/* SHOULD NOT FLAG: punctuation and separators are not language */}
      <span>·</span>
      <span>/</span>
      <span>—</span>
      <span>42</span>

      {/* SHOULD NOT FLAG: attributes nobody reads */}
      <div className="rounded-md bg-raised" id="sidebar" data-state="open" />

      {/* i18n-exempt — the brand name is the same in every language */}
      <span>FormuFlash</span>
    </div>
  );
}
