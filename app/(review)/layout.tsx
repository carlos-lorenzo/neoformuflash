/**
 * Layout for the chrome-free review route group.
 *
 * No AppShell, no sidebar, no header — the review screen is a single-purpose
 * focused surface (spec §Component inventory). ShortcutManager is mounted
 * here so review-scope bindings (1-4, Space, e, u, Esc) work in any child.
 *
 * Phase 03c moved the review route under /app/courses/[id]/review/[deckId].
 * The group's directory nesting mirrors that URL so the page keeps the
 * course-scoped path while escaping app/app/layout.tsx's AppShell — a route
 * group is transparent to the URL but not to layout inheritance. /app is
 * already in the middleware's AUTHED_PREFIXES, so the primary auth gate covers
 * it; this layout's getSessionUser() is the second line of defence.
 */

import { redirect } from 'next/navigation';
// KaTeX CSS loaded structurally here (and in app/app/layout.tsx) so the review
// card and any NoteDocView surface gets styled equations whether or not the
// inline-edit editor is mounted.
import 'katex/dist/katex.min.css';
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
