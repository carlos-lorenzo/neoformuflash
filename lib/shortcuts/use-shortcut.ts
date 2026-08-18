'use client';

// Client: registers a shortcut binding in the provider context.

import { useCallback, useContext, useEffect, useId, useRef } from 'react';
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
  options?: { label?: string; requireModified?: boolean; allowInEditable?: boolean; disabled?: boolean }
): void {
  const ctx = useContext(ShortcutContext);
  const id = useId();
  // Same as useActiveScope: depend on the stable function refs, not the ctx
  // object, which the provider recreates whenever the scope stack changes.
  const register = ctx?.register;
  const unregister = ctx?.unregister;

  /*
   * Latest-ref pattern: the registered binding is created ONCE on mount with a
   * stable wrapper, and the wrapper dispatches to onPressRef.current, which is
   * updated every render. Without this, the closure captured at mount freezes
   * the state the handler reads (phase, queue, deck id) forever — the phase-03b
   * defect where review grades 1-4, e, u and Esc were all dead.
   *
   * Do NOT add onPress to the effect deps: that re-registers on every render,
   * and the provider's register/unregister churn trips "Maximum update depth
   * exceeded". Register once, dispatch via the ref.
   */
  const onPressRef = useRef(onPress);
  useEffect(() => {
    onPressRef.current = onPress;
  });
  const stableOnPress = useCallback(() => {
    onPressRef.current();
  }, []);

  useEffect(() => {
    if (!register || !unregister) return;
    // `disabled` lets a shared component (MathEditorField) conditionally skip
    // registration without conditionally calling the hook — used in pair mode
    // where the parent owns the ⌘M routing.
    if (options?.disabled) return;

    register({
      id,
      keys,
      scope,
      label: options?.label ?? '',
      onPress: stableOnPress,
      requireModified: options?.requireModified ?? false,
      allowInEditable: options?.allowInEditable ?? false,
    });

    return () => {
      unregister(id);
    };
    // Intentionally only register/unregister on mount/unmount.
    // The onPress closure is updated via onPressRef, never via re-register.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [register, unregister, id, keys, scope, stableOnPress, options?.disabled]);
}
