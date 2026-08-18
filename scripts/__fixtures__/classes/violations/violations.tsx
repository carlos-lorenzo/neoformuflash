/*
 * FIXTURE for scripts/assert-classes-compile.test.ts — the positive direction.
 * The four dead classes below (reset namespaces) are NOT in compiled.css; the
 * non-class strings must NOT be flagged. Exact count is asserted by the test,
 * so adding a case means updating the count too.
 */
/* A dotted i18n-style key must not be treated as a class. */
const TRANSLATION_KEY = 'content.deck.invalid';

export function DeadClasses() {
  return (
    <div className="max-w-3xl min-h-touch flip-front">
      {/* max-w-2xl is the second dead class; the others are deliberate
          i18n / attribute strings that must stay silent. */}
      <span className="max-w-2xl" />
      <p>{TRANSLATION_KEY}</p>
      <input autoComplete="current-password" data-state="open" />
      <span className="mod" />
    </div>
  );
}
