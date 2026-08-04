import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

/*
 * The token linter is the enforcement mechanism for the whole design system
 * (design-system.md §9: "Written rules are hopes. Items 1–5 are the actual
 * guarantee."). So it gets tested like production code — an enforcement layer
 * that silently stops matching is worse than none, because it manufactures
 * confidence.
 */

function runLinter(roots: string): { status: number; output: string } {
  try {
    const output = execFileSync('node', ['scripts/lint-tokens.mjs', '--roots', roots], {
      encoding: 'utf8',
      stdio: 'pipe',
    });
    return { status: 0, output };
  } catch (error) {
    const err = error as { status: number; stdout: string; stderr: string };
    return { status: err.status, output: `${err.stdout}${err.stderr}` };
  }
}

describe('lint:tokens', () => {
  it('passes on the real source tree', () => {
    const { status, output } = runLinter('app,components,lib,styles');
    expect(output).toContain('clean');
    expect(status).toBe(0);
  });

  const expectedRules = [
    'raw-colour',
    'arbitrary-value',
    'stock-palette',
    'stock-black-white',
    'stock-font-size',
    'stock-radius',
    'stock-shadow',
    'stock-font-weight',
    'numeric-duration',
    'animated-layout-property',
    'off-grid-spacing',
    // These two were missing from this list, and were also the only two checks
    // that ran on `.css` files and nothing else. A rule with no entry here is a
    // rule that can stop matching without anyone noticing — which is what
    // happened: `style={{ gap: '13px' }}` was unguarded for the whole of phase 00.
    'off-grid-px',
    'raw-duration',
  ];

  it.each(expectedRules)('catches a planted %s violation', (rule) => {
    const { status, output } = runLinter('scripts/__fixtures__');
    expect(status).toBe(1);
    expect(output).toContain(`${rule}:`);
  });

  /*
   * The design-critic calibration in docs/MEASUREMENT.md plants exactly these
   * three. They must be caught in either syntax — a developer reaches for an
   * inline style at least as readily as an arbitrary Tailwind value.
   */
  it.each([
    ['a hardcoded hex', "style={{ color: '#ff0000' }}", 'raw-colour'],
    ['a 13px gap, inline', "style={{ gap: '13px' }}", 'off-grid-px'],
    ['a 300ms transition, inline', "style={{ transitionDuration: '300ms' }}", 'raw-duration'],
    ['an off-grid length reached through a variable', "'18px'", 'off-grid-px'],
  ])('catches %s', (_label, _syntax, rule) => {
    const { output } = runLinter('scripts/__fixtures__');
    expect(output).toContain(`${rule}:`);
  });

  it('does not flag forbidden class names that appear inside comments', () => {
    // The fixture's own header names bg-red-500 and duration-300 in prose.
    // Each appears exactly once in real code, so a comment match would double it.
    const { output } = runLinter('scripts/__fixtures__');
    const occurrences = (needle: string) => output.split(needle).length - 1;

    expect(occurrences('  bg-red-500\n')).toBe(1);
    expect(occurrences('  duration-300\n')).toBe(1);
  });
});
