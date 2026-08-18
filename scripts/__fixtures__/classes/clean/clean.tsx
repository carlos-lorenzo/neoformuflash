/*
 * FIXTURE for scripts/assert-classes-compile.test.ts — the negative direction.
 * Every class below IS in compiled.css, including the tricky shapes: escaped
 * variant colons, attribute-selector variants, opacity modifiers, arbitrary
 * values, negatives, compound classes and custom utilities. A false positive
 * here gets the checker disabled.
 */
/* A dotted i18n-style key must not be treated as a class. */
const TRANSLATION_KEY = 'review.grade.again';

export function ValidClasses() {
  return (
    <div className="bg-base hover:bg-accent-hover bg-base/80 divide-subtle">
      <span className="max-w-[68ch] -translate-x-1/2 flip-container flipped" />
      <span className="aria-disabled:opacity-50 tablet:hidden dark:bg-base text-ui-xs" />
      <p>{TRANSLATION_KEY}</p>
    </div>
  );
}
