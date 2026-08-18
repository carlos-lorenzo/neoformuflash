'use client';

import { useContext } from 'react';
import { useRouter } from 'next/navigation';
import { useShortcut } from './use-shortcut';
import { ShortcutContext } from './provider';

/**
 * Register all global-scope shortcuts.
 *
 * Phase 03c: removed decks and notes listings from global nav. Kept
 * goHome, goCourses, and the g-prefix is trimmed accordingly.
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

  // g c → courses (/app/courses)
  useShortcut('global', 'g>c', () => router.push('/app/courses'), {
    label: 'shortcuts.goCourses',
  });

  return null;
}