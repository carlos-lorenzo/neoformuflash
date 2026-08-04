import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LOCALES, type Locale } from '@neoformuflash/contracts';
import { SHIPPED_LOCALES, isShippedLocale } from './shipped';

/*
 * The Catalan crash was one thing: `LOCALES` advertised `'ca'` while
 * `messages/ca.json` did not exist, and the next-intl request config threw
 * on every render for any user whose locale resolved to it. A comment
 * saying "keep these in sync" is precisely the thing that already failed.
 *
 * These tests fail if the two lists ever drift again — in either direction:
 * dropping a catalog without dropping its entry, or landing a catalog
 * without adding its entry (which would mean phase 04 shipped Catalan and
 * this file still hides it).
 */

const messagesDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'messages');

function catalogsOnDisk(): string[] {
  return readdirSync(messagesDir)
    .filter((name) => name.endsWith('.json'))
    .map((name) => name.replace(/\.json$/, ''))
    .filter((name) => name !== 'pseudo'); // pseudo is a test instrument, not a shipped locale
}

describe('SHIPPED_LOCALES', () => {
  it('is a subset of the frozen LOCALES type', () => {
    // Every shipped locale must be a valid profile value; the DB check
    // constraint enforces the same set. Widening past `LOCALES` is a schema
    // change, not a UI change.
    for (const locale of SHIPPED_LOCALES) {
      expect(LOCALES).toContain(locale as Locale);
    }
  });

  it('names exactly the catalogs on disk', () => {
    // Two failures worth distinguishing:
    //   - a shipped locale with no catalog → the crash we just fixed
    //   - a catalog with no shipped entry → phase 04 half-landed
    const shipped = [...SHIPPED_LOCALES].sort();
    const catalogs = catalogsOnDisk().sort();
    expect(shipped).toEqual(catalogs);
  });
});

describe('isShippedLocale', () => {
  it('accepts every shipped locale and nothing else', () => {
    for (const locale of SHIPPED_LOCALES) {
      expect(isShippedLocale(locale)).toBe(true);
    }
    expect(isShippedLocale('ca')).toBe(false); // in LOCALES, not shipped yet
    expect(isShippedLocale('fr')).toBe(false);
    expect(isShippedLocale('')).toBe(false);
    expect(isShippedLocale(null)).toBe(false);
    expect(isShippedLocale(undefined)).toBe(false);
    expect(isShippedLocale(42)).toBe(false);
  });
});
