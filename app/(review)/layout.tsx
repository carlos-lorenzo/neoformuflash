/**
 * Layout for the chrome-free review route group.
 *
 * No AppShell, no sidebar, no header — the review screen is a single-purpose
 * focused surface (spec §Component inventory). ShortcutManager is mounted
 * here so review-scope bindings (1-4, Space, e, u, Esc) work in any child.
 *
 * This is the repo's first route group outside /app (spec Risks). The
 * middleware adds /review to AUTHED_PREFIXES as the primary gate; this
 * layout's getSessionUser() is the second line of defence.
 */

import { redirect } from 'next/navigation';
import { ShortcutManager } from '@/lib/shortcuts/shortcut-manager';
import { getProfile } from '@/lib/db/profiles';
import { getSessionUser } from '@/lib/supabase/session';

export default async function ReviewLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect('/login');

  const profile = await getProfile(user.id);
  const enabled = profile.ok ? profile.value?.keyboardShortcutsEnabled ?? true : true;

  return (
    <ShortcutManager enabled={enabled}>
      {/* Full-viewport container: no sidebar, no header, no AppShell chrome. */}
      <div className="flex min-h-dvh flex-col bg-base">
        {children}
      </div>
    </ShortcutManager>
  );
}
