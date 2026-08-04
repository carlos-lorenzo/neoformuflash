/*
 * Fixture: a *test* file that is full of violations the linter must ignore.
 *
 * Component tests have to render literal strings — that is what they assert on.
 * If the linter reads them, every component test needs an `i18n-exempt` comment
 * per line and the escape hatch stops meaning anything. This file exists so the
 * exclusion is proven rather than assumed, and so it stays narrow: it is skipped
 * for being `*.test.tsx`, not for living under `__fixtures__`.
 */

export function ButtonUnderTest() {
  return (
    <button aria-label="A label that should never be reported" title="Nor this one">
      Ignored fixture copy
    </button>
  );
}
