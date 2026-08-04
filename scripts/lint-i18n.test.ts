import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

/*
 * Acceptance criterion 9 depends entirely on this linter being accurate in both
 * directions. False negatives let hardcoded strings ship; false positives get
 * the whole check disabled. The negative assertions below are the ones that
 * keep it usable.
 */

function runLinter(roots: string): { status: number; output: string } {
  try {
    const output = execFileSync('node', ['scripts/lint-i18n.mjs', '--roots', roots], {
      encoding: 'utf8',
      stdio: 'pipe',
    });
    return { status: 0, output };
  } catch (error) {
    const err = error as { status: number; stdout: string; stderr: string };
    return { status: err.status, output: `${err.stdout}${err.stderr}` };
  }
}

describe('lint:i18n', () => {
  const fixture = runLinter('scripts/__fixtures__');

  it('fails when hardcoded strings are present', () => {
    expect(fixture.status).toBe(1);
  });

  it.each([
    ['literal JSX text', 'Sign in to continue'],
    ['a placeholder attribute', 'placeholder="Search your notes"'],
    ['an aria-label attribute', 'aria-label="Note search"'],
    ['an alt attribute', 'alt="A worked derivation"'],
  ])('flags %s', (_label, expected) => {
    expect(fixture.output).toContain(expected);
  });

  it.each([
    ['catalog lookups', "t('login.title')"],
    ['punctuation and separators', '·'],
    ['bare numbers', '42'],
    ['className values', 'rounded-md'],
    ['data and id attributes', 'sidebar'],
    ['lines marked i18n-exempt', 'FormuFlash'],
  ])('does not flag %s', (_label, notExpected) => {
    expect(fixture.output).not.toContain(notExpected);
  });

  it('reports one finding per violation, and no more', () => {
    const findingLines = fixture.output
      .split('\n')
      .filter((line) => line.includes('scripts/__fixtures__/i18n-violations.tsx:'));
    expect(findingLines).toHaveLength(4);
  });
});
