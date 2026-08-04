/*
 * FIXTURE — every line below is a deliberate token violation.
 *
 * Excluded from tsconfig and eslint; never bundled. It is the input to
 * scripts/lint-tokens.test.ts, which asserts each rule actually fires.
 * A linter nobody tests is a linter that quietly stops working.
 *
 * The MEASUREMENT.md calibration plants — a hardcoded hex, a 13px gap, a 300ms
 * transition — appear TWICE below, once per syntax, and that duplication is the
 * point. This fixture used to cover only the Tailwind class form (`gap-[13px]`,
 * `duration-300`). Written the other natural way, as an inline style object, two
 * of the three sailed straight through: the px and duration checks ran on `.css`
 * files only. The fixture was asserting a guarantee the linter did not provide.
 *
 * So: any new check needs a case in BOTH syntaxes, and a name in the
 * `expectedRules` list in scripts/lint-tokens.test.ts. The two checks that had
 * no entry in that list were exactly the two that were silently CSS-only.
 *
 * This comment also exercises comment-stripping: it names bg-red-500 and
 * duration-300 without those counting as violations.
 */
export function Planted() {
  return (
    <div style={{ color: '#ff0000' }}>
      <span className="bg-red-500 p-5 rounded-xl text-sm duration-300" />
      <span className="gap-[13px] font-bold shadow-lg text-white" />
      <span className="transition-all mt-7 max-w-[500px]" />

      {/* The same three violations again, as inline styles. */}
      <span style={{ gap: '13px' }} />
      <span style={{ transitionDuration: '300ms' }} />

      {/* Via a variable, so the check cannot be narrowed to the style attribute. */}
      <span style={{ marginTop: INDIRECT_GAP }} />
    </div>
  );
}

const INDIRECT_GAP = '18px';
