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
  ];

  it.each(expectedRules)('catches a planted %s violation', (rule) => {
    const { status, output } = runLinter('scripts/__fixtures__');
    expect(status).toBe(1);
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
