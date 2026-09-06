'use client';

import { useSyncExternalStore } from 'react';

/*
 * The ≥768px gate from specs/design-system.md §6: both editors are usable at
 * tablet and above, and read-only below it.
 *
 * Extracted from note-editor.tsx, which owned a private copy, because the
 * multi-card deck editor needs exactly the same gate and two copies of a
 * breakpoint is two places for it to drift from the design system.
 *
 * useSyncExternalStore rather than an effect + state: the server snapshot is
 * `false`, so the first client paint agrees with the HTML and the read-only
 * branch never flashes on a desktop load.
 */

const QUERY = '(min-width: 768px)';

function subscribe(onChange: () => void): () => void {
  const mq = window.matchMedia(QUERY);
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
}

function getSnapshot(): boolean {
  return window.matchMedia(QUERY).matches;
}

/** Server render assumes mobile, so the read-only branch is what SSR emits. */
function getServerSnapshot(): boolean {
  return false;
}

export function useIsTablet(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
