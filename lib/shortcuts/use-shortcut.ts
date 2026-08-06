'use client';

// Client: registers a shortcut binding in the provider context.

import { useContext, useEffect, useId } from 'react';
import { ShortcutContext } from './provider';
import type { Scope } from './types';

/**
 * Register a keyboard binding for the lifetime of the calling component.
 *
 * The binding is removed automatically on unmount (criterion 8).
 *
 * @example
 *   useShortcut('list', 'c', () => createNote(), { label: 'shortcuts.create' });
 */
export function useShortcut(
  scope: Scope,
  keys: string,
  onPress: () => void,
  options?: { label?: string; requireModified?: boolean }
): void {
  const ctx = useContext(ShortcutContext);
  const id = useId();

  useEffect(() => {
    if (!ctx) return;

    ctx.register({
      id,
      keys,
      scope,
      label: options?.label ?? '',
      onPress,
      requireModified: options?.requireModified ?? false,
    });

    return () => {
      ctx.unregister(id);
    };
    // Intentionally only register/unregister on mount/unmount.
    // Binding metadata is read from the ref at keydown time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx, id, keys, scope]);
}
