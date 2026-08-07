import type { Profile } from '@/lib/db/profiles';
import type { Result } from '@/lib/result';

/*
 * Where a signed-in user lands after their profile fetch.
 *
 * The distinction that matters is "no profile row yet" vs "could not read the
 * profile". Both make the dashboard unrenderable, but only the first may go to
editor* /onboarding. If the row exists (hasProfile would say so) and the full read
 * failed, /onboarding redirects straight back to /app — an infinite redirect
 * loop. resolveAppEntry maps that failure to `login` so the layout surfaces it
 * instead of looping.
 */
export type AppEntry =
  | { kind: 'app'; profile: Profile }
  | { kind: 'onboarding' }
  | { kind: 'login'; cause?: unknown };

export function resolveAppEntry(profile: Result<Profile | null>): AppEntry {
  if (!profile.ok) return { kind: 'login', cause: profile.cause };
  if (profile.value === null) return { kind: 'onboarding' };
  return { kind: 'app', profile: profile.value };
}
