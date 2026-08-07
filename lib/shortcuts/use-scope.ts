'use client';

// Client: pushes/pops a scope on the provider's scope stack.

import { useContext, useEffect } from 'react';
import { ShortcutContext } from './provider';
import type { Scope } from './types';

/**
 * Declare that this screen's bindings belong to `scope`.
 *
 * Pushed on mount, popped on unmount (criterion 8). The provider resolves
 * bindings against the most specific active scope.
 *
 * @example
 *   useActiveScope('list');
 */
export function useActiveScope(scope: Scope): void {
  const ctx = useContext(ShortcutContext);
  // Depend on the stable function refs, never the ctx object: the provider
  // recreates ctx on every pushScope/popScope (activeScopes is in its memo
  // deps), so depending on ctx would re-run this effect forever and trip
  // React's "Maximum update depth exceeded".
  const push = ctx?.pushScope;
  const pop = ctx?.popScope;

  useEffect(() => {
    if (!push || !pop) return;
    push(scope);
    return () => {
      pop(scope);
    };
  }, [push, pop, scope]);
}
