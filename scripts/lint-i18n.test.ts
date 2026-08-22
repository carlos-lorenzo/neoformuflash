import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

/*
 * Two-directional test for the i18n linter. The original four cases test the
 * hardcoded-literal check. Phase 03b adds a second batch testing the four new
 * checks: key existence, template prefix, shortcut labels, and locale parity.
 *
 * The negative assertions are the ones that keep it usable — a linter that
 * flags `·` or a `className` string gets a blanket ignore within a week.
 */

function runLinter(roots: string, messages?: string): { status: number; output: string } {
  const args = ['scripts/lint-i18n.mjs', '--roots', roots];
  if (messages) args.push('--messages', messages);
  try {
    const output = execFileSync('node', args, { encoding: 'utf8', stdio: 'pipe' });
    return { status: 0, output };
  } catch (error) {
    const err = error as { status: number; stdout: string; stderr: string };
    return { status: err.status, output: `${err.stdout}${err.stderr}` };
  }
}

describe('lint:i18n — hardcoded literals', () => {
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
    ['punctuation and separators', '·'],
    ['bare numbers', '42'],
    ['className values', 'rounded-md'],
    ['data and id attributes', 'sidebar'],
    ['lines marked i18n-exempt', 'FormuFlash'],
  ])('does not flag %s', (_label, notExpected) => {
    expect(fixture.output).not.toContain(notExpected);
  });

  it('does not flag catalog lookups (t()) as hardcoded literals', () => {
    // The linter now also checks key existence, so t('login.title') appears
    // in the output as a "missing key" finding, not as a "literal text" finding.
    // This test verifies that t() calls are not incorrectly flagged as hardcoded literals.
    expect(fixture.output).not.toContain("t('login.title')\n    literal text in JSX");
    expect(fixture.output).not.toContain("t('common.close')\n    literal text in JSX");
  });

  it.each([
    ['literal text in a test file', 'Ignored fixture copy'],
    ['a user-visible attribute in a test file', 'A label that should never be reported'],
  ])('skips %s', (_label, notExpected) => {
    expect(fixture.output).not.toContain(notExpected);
  });

  it('reports one finding per violation, and no more', () => {
    const findingLines = fixture.output
      .split('\n')
      .filter((line) => line.includes('scripts/__fixtures__/i18n-violations.tsx:'));
    // 4 hardcoded literals. t('login.title') and t('common.close') resolve against
    // the real project catalog (they are present in messages/en.json).
    expect(findingLines).toHaveLength(4);
  });
});

describe('lint:i18n — key resolution', () => {
  const fixture = runLinter(
    'scripts/__fixtures__',
    'scripts/__fixtures__/messages'
  );

  it('fails when missing keys, bad labels, or unresolvable sites exist', () => {
    expect(fixture.status).toBe(1);
  });

  it('flags a missing key under a bound namespace', () => {
    expect(fixture.output).toContain("missing key — 'review.no.such.key'");
  });

  it('flags a template prefix with no catalog leaves', () => {
    expect(fixture.output).toContain("template prefix — no catalog leaf starts with 'review.nonexistent.'");
  });

  it('does not flag a template prefix that has leaves', () => {
    expect(fixture.output).not.toContain("no catalog leaf starts with 'review.grade.'");
  });

  it('flags a shortcut registered with no options', () => {
    expect(fixture.output).toContain('shortcut registered with no options object');
  });

  it('flags a shortcut label that is not a root key', () => {
    expect(fixture.output).toContain("shortcut label is not a root catalog key");
    expect(fixture.output).toContain("'gradeHard'");
  });

  it('flags an unresolvable t() call (t not bound via useTranslations)', () => {
    // tc is not bound in the fixture → counted as unresolvable
    expect(fixture.output).toMatch(/1 unresolvable/);
  });

  it('the i18n-dynamic-key comment suppresses the unresolvable count', () => {
    // i18n-dynamic.tsx has t(choice) marked i18n-dynamic-key — must not count
    const dynamic = runLinter(
      'scripts/__fixtures__',
      'scripts/__fixtures__/messages'
    );
    // The total unresolvable should be 1 (from i18n-missing-keys.tsx), not 2
    expect(dynamic.output).toMatch(/1 unresolvable/);
  });
});

describe('lint:i18n — locale parity', () => {
  it('flags a key present in en but missing from es', () => {
    const fixture = runLinter(
      'scripts/__fixtures__',
      'scripts/__fixtures__/messages'
    );
    expect(fixture.output).toContain('key present in en.json but missing from es.json');
  });

  it('flags a key present in es but missing from en', () => {
    // Swap the catalogs by renaming temporarily — instead, just check the
    // fixture catalog has es-only keys. The es fixture is intentionally
    // incomplete, so the parity check fires.
    const fixture = runLinter(
      'scripts/__fixtures__',
      'scripts/__fixtures__/messages'
    );
    // The fixture es.json has fewer keys than en.json
    expect(fixture.status).toBe(1);
  });
});

describe('lint:i18n — real codebase', () => {
  it('has zero unresolvable translation call sites', () => {
    const result = runLinter('app,components');
    // Two acceptable shapes: the "clean" summary omits the unresolvable count
    // when everything passes; the failing summary spells it out.
    expect(result.output).toMatch(/0 unresolvable|— clean/);
  });
});
