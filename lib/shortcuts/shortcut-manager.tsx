'use client';

// Client: thin wrapper that creates router-based actions and passes them
// to the provider. Mounted from the server AppShell.

import { useRouter } from 'next/navigation';
import { useMemo, type ReactNode } from 'react';
import { ShortcutProvider } from './provider';
import { GlobalShortcuts } from './global-shortcuts';
import type { GSecondKeyMap } from './types';

export type ShortcutManagerProps = {
  children: ReactNode;
  enabled: boolean;
};

export function ShortcutManager({ children, enabled }: ShortcutManagerProps) {
  const router = useRouter();

  const gSecondKeyMap: GSecondKeyMap = useMemo(
    () => ({
      h: {
        label: 'shortcuts.goHome',
        onPress: () => router.push('/app'),
      },
      c: {
        label: 'shortcuts.goCourses',
        onPress: () => router.push('/app/courses'),
      },
    }),
    [router]
  );

  return (
    <ShortcutProvider enabled={enabled} gSecondKeyMap={gSecondKeyMap}>
      <GlobalShortcuts />
      {children}
    </ShortcutProvider>
  );
}
