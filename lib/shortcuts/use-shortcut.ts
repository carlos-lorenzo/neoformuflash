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
      /*
       * Derived from the key string, not demanded from the caller.
       *
       * The dispatcher only considers a binding for a modified keypress when
       * `requireModified` is true, so a `mod+*` binding registered without it
       * is dead on arrival. Five of the eight `mod+*` registrations in this
       * app were exactly that: ⌘↩ save, ⌘⇧↩ save-and-new, and both math
       * bindings in the card editors never fired. Math still appeared to work
       * because MathEditorField ALSO handles ⌘M at the ProseMirror level, so
       * the dead binding had nothing left to prove — and `⌘↩` simply did
       * nothing while phase 03b's acceptance criteria recorded it as passing.
       *
       * A binding whose keys start with `mod+` IS modified. Making the caller
       * restate that is a trap, and this is the one place that knows both.
       */
      requireModified: options?.requireModified ?? keys.startsWith('mod+'),
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
