import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

/*
 * Two-directional test for the dead-class checker. The positive direction
 * (violations fixture) proves it fires on real dead classes; the negative
 * direction (clean fixture) proves it does NOT fire on the tricky selector
 * shapes or on i18n/attribute strings that merely look class-like. The
 * negative cases are the ones that keep the checker usable — a false positive
 * gets the whole check disabled, and then it is enforcing nothing.
 */

function run(roots: string): { status: number; output: string } {
  try {
    const output = execFileSync(
      'node',
      [
        'scripts/assert-classes-compile.mjs',
        '--css-dir',
        'scripts/__fixtures__/classes',
        '--roots',
        roots,
        '--globals',
        'scripts/__fixtures__/classes/globals.css',
      ],
      { encoding: 'utf8', stdio: 'pipe' }
    );
    return { status: 0, output };
  } catch (error) {
    const err = error as { status: number; stdout: string; stderr: string };
    return { status: err.status, output: `${err.stdout}${err.stderr}` };
  }
}

describe('assert-classes-compile', () => {
  const violations = run('scripts/__fixtures__/classes/violations');

  it('fails when dead classes are present', () => {
    expect(violations.status).toBe(1);
  });

  it('flags exactly the classes absent from the compiled CSS', () => {
    for (const dead of ['max-w-3xl', 'max-w-2xl', 'min-h-touch', 'flip-front']) {
      expect(violations.output).toContain(dead);
    }
    // the finding count must be exact — adding a case updates this test
    expect(violations.output).toMatch(/4 dead class\(es\)/);
  });

  it.each([
    ['an i18n key with dots', 'content.deck.invalid'],
    ['an autoComplete value', 'current-password'],
    ['an attribute value', 'data-state'],
    ['a bare identifier', 'mod'],
  ])('does not flag %s', (_label, notExpected) => {
    expect(violations.output).not.toContain(notExpected);
  });

  it('passes when every class is in the compiled CSS', () => {
    const clean = run('scripts/__fixtures__/classes/clean');
    expect(clean.status).toBe(0);
  });

  it('fails when a custom class is missing from globals.css (no amnesty)', () => {
    // Point at a globals.css that lacks the custom classes.
    try {
      execFileSync(
        'node',
        [
          'scripts/assert-classes-compile.mjs',
          '--css-dir',
          'scripts/__fixtures__/classes',
          '--roots',
          'scripts/__fixtures__/classes/clean',
          '--globals',
          'scripts/__fixtures__/classes/compiled.css', // a CSS file, not a globals file
        ],
        { encoding: 'utf8', stdio: 'pipe' }
      );
      expect.unreachable('should have exited non-zero');
    } catch (error) {
      const err = error as { status: number; stdout: string; stderr: string };
      expect(err.status).toBe(1);
      expect(`${err.stdout}${err.stderr}`).toContain('listed in assert-classes-compile.mjs but not defined');
    }
  });
});
