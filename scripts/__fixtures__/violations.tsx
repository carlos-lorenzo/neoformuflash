/*
 * FIXTURE — every line below is a deliberate token violation.
 *
 * Excluded from tsconfig and eslint; never bundled. It is the input to
 * scripts/lint-tokens.test.ts, which asserts each rule actually fires.
 * A linter nobody tests is a linter that quietly stops working.
 *
 * The first three violations are the exact ones docs/MEASUREMENT.md plants for
 * the design-critic calibration: a hardcoded hex, a 13px gap, a 300ms
 * transition. lint:tokens catches all three mechanically, so the critic is a
 * taste second opinion layered on a guarantee, not the guarantee itself.
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
    </div>
  );
}
