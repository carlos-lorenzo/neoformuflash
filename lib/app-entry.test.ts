import { describe, expect, it } from 'vitest';
import type { Profile } from '@/lib/db/profiles';
import { err, ok } from '@/lib/result';
import { resolveAppEntry } from './app-entry';

/*
 * Regression test for a bug that reached the user as a locked-out browser:
 * switching the DB to a hosted Supabase project that was missing migration
 * 0009 (profiles.keyboard_shortcuts_enabled) made getProfile error while
 * hasProfile still saw the row. /app redirected to /onboarding (getProfile →
 * null) and /onboarding redirected straight back (hasProfile → true) — an
 * infinite redirect loop.
 *
 * The fix pins the one arm that must never send a user to onboarding: a failed
 * read, where the row may still exist.
 */

const profile: Profile = {
  id: 'u1',
  slug: 'carlos',
  handle: 'carlos',
  displayName: 'Carlos',
  avatarUrl: null,
  locale: 'en',
  institutionId: null,
  degreeText: null,
  isPro: false,
  keyboardShortcutsEnabled: true,
};

describe('resolveAppEntry', () => {
  it('sends a user with a profile to the app', () => {
    expect(resolveAppEntry(ok(profile))).toEqual({ kind: 'app', profile });
  });

  it('sends a user with no profile row to onboarding', () => {
    expect(resolveAppEntry(ok(null))).toEqual({ kind: 'onboarding' });
  });

  it('never sends a user to onboarding when the read failed — that is the loop', () => {
    const entry = resolveAppEntry(err('error.unexpected'));
    expect(entry.kind).toBe('login');
  });
});
