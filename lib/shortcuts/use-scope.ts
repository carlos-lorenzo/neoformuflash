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

  useEffect(() => {
    if (!ctx) return;
    ctx.pushScope(scope);
    return () => {
      ctx.popScope(scope);
    };
  }, [ctx, scope]);
}
