/**
 * Single source of truth for platform detection.
 *
 * Both Kbd (server-rendered, used once per hint) and the dispatcher
 * (client-side, checked on every keystroke) import this. The result
 * is cached on first call — navigator.platform doesn't change at runtime.
 */

let cached: boolean | null = null;

export function isMac(): boolean {
  if (cached !== null) return cached;
  cached =
    typeof navigator !== 'undefined' &&
    /Mac|iPod|iPhone|iPad/.test(navigator.platform);
  return cached;
}
