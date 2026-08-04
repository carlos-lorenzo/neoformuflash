import { describe, expect, it } from 'vitest';
import { DEFAULT_LOCALE, isLocale, resolveLocale } from './i18n';

/*
 * Acceptance criterion 1c: interface language is detected from Accept-Language
 * on first visit, stored on the profile, and changeable from settings.
 *
 * This resolver is the whole of that logic, and it runs during server render —
 * which is what makes "no flash of the wrong language" true by construction.
 */

describe('resolveLocale', () => {
  it('falls back to English when nothing is known', () => {
    expect(resolveLocale(null, null)).toBe('en');
    expect(DEFAULT_LOCALE).toBe('en');
  });

  it('matches a Spanish browser on the primary subtag (AC 1c)', () => {
    expect(resolveLocale(null, 'es-ES,es;q=0.9,en;q=0.8')).toBe('es');
  });

  it('lets a stored profile locale override the header', () => {
    // A student who chose English on a Spanish laptop meant it. Re-detecting
    // from the header on every request would silently undo that choice.
    expect(resolveLocale('en', 'es-ES,es;q=0.9')).toBe('en');
    expect(resolveLocale('ca', 'en-GB,en;q=0.9')).toBe('ca');
  });

  it('honours q-value ordering rather than string order', () => {
    expect(resolveLocale(null, 'de;q=0.2,ca;q=0.9')).toBe('ca');
    expect(resolveLocale(null, 'en;q=0.3,es;q=0.7')).toBe('es');
  });

  it('skips languages we do not support', () => {
    expect(resolveLocale(null, 'de-DE,de;q=0.9,fr;q=0.8')).toBe('en');
    expect(resolveLocale(null, 'de-DE,de;q=0.9,es;q=0.1')).toBe('es');
  });

  it('ignores entries with q=0, which mean "not acceptable"', () => {
    expect(resolveLocale(null, 'es;q=0,en;q=0.5')).toBe('en');
  });

  it('resolves regional variants to their base language', () => {
    expect(resolveLocale(null, 'es-419')).toBe('es');
    expect(resolveLocale(null, 'en-US')).toBe('en');
    expect(resolveLocale(null, 'ca-ES-valencia')).toBe('ca');
  });

  it('is case-insensitive', () => {
    expect(resolveLocale(null, 'ES-es')).toBe('es');
  });

  it('never throws on a malformed header', () => {
    // This input comes off the network. A bad header must not be able to break
    // a page render.
    for (const header of ['', ',,,', ';q=', 'es;q=abc', '*', 'es;;q=0.9;;']) {
      expect(() => resolveLocale(null, header)).not.toThrow();
      expect(isLocale(resolveLocale(null, header))).toBe(true);
    }
  });

  it('ignores an invalid stored profile locale rather than trusting it', () => {
    expect(resolveLocale('klingon', 'es-ES')).toBe('es');
    expect(resolveLocale('', 'es-ES')).toBe('es');
  });
});

describe('isLocale', () => {
  it('accepts the three supported locales and nothing else', () => {
    expect(isLocale('en')).toBe(true);
    expect(isLocale('es')).toBe(true);
    expect(isLocale('ca')).toBe(true);
    expect(isLocale('fr')).toBe(false);
    expect(isLocale(null)).toBe(false);
    expect(isLocale(42)).toBe(false);
  });
});
