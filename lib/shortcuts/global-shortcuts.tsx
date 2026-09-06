'use client';

import { useContext } from 'react';
import { useRouter } from 'next/navigation';
import { useShortcut } from './use-shortcut';
import { ShortcutContext } from './provider';

/**
 * Register all global-scope shortcuts.
 *
 * The merged Home/Courses dashboard lives at /app, so there is exactly one
 * home to go to: g h. The g-prefix map in shortcut-manager.tsx is kept in
 * step — no second key is registered.
 */
export function GlobalShortcuts() {
  const router = useRouter();
  const ctx = useContext(ShortcutContext);

  // ? → open shortcut overlay
  useShortcut('global', '?', () => ctx?.openOverlay(), {
    label: 'shortcuts.overlay',
  });

  // / → focus search (placeholder — no search input exists yet)
  useShortcut('global', '/', () => {}, {
    label: 'shortcuts.search',
  });

  // ⌘K / Ctrl+K → command palette (placeholder)
  useShortcut('global', 'mod+k', () => {}, {
    label: 'shortcuts.commandPalette',
    requireModified: true,
  });

  // g h → home (/app)
  useShortcut('global', 'g>h', () => router.push('/app'), {
    label: 'shortcuts.goHome',
  });

  return null;
}