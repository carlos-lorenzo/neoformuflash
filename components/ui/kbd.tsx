// Server Component: renders platform-correct keyboard hints.
//
// Uses one shared platform check (lib/shortcuts/platform.ts) so every
// call site gets ⌘ on macOS and Ctrl elsewhere without repetition.

import { isMac } from '@/lib/shortcuts/platform';
import { cn } from '@/lib/cn';

export type KbdProps = {
  /** Key labels — 'mod' resolves to ⌘ or Ctrl based on platform. */
  keys: string[];
  className?: string;
};

const KEY_LABELS: Record<string, string> = {
  mod: isMac() ? '⌘' : 'Ctrl',
  escape: 'Esc',
  enter: '↵',
  arrowup: '↑',
  arrowdown: '↓',
  arrowleft: '←',
  arrowright: '→',
  backspace: '⌫',
  delete: '⌫',
  ' ': 'Space',
};

export function Kbd({ keys, className }: KbdProps) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex items-center gap-1 font-mono text-ui-xs tracking-ui text-tertiary',
        className
      )}
    >
      {keys.map((key, i) => {
        const label = KEY_LABELS[key.toLowerCase()] ?? key;
        return (
          <kbd
            key={`${key}-${i}`}
            className="inline-flex items-center justify-center rounded-sm border border-subtle bg-inset px-2 py-1 leading-none"
          >
            {label}
          </kbd>
        );
      })}
    </span>
  );
}
