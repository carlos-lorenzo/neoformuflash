'use client';

// Client: registers the global keyboard bindings with real router actions.
//
// Must be rendered inside ShortcutProvider.

import { useContext } from 'react';
import { useRouter } from 'next/navigation';
import { useShortcut } from './use-shortcut';
import { ShortcutContext } from './provider';

/**
 * Register all global-scope shortcuts.
 *
 * Each binding from the frozen registry gets a real action. Only bindings
 * for routes that exist today are registered — the remaining entries are
 * added by the phases that build those routes.
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

  // g n → notes (/app/notes)
  useShortcut('global', 'g>n', () => router.push('/app/notes'), {
    label: 'shortcuts.goNotes',
  });

  return null;
}
