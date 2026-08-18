'use client';

// Client: renders the shortcut overlay (criterion 4).
//
// Uses the existing Dialog component for focus trap, escape, and portal.
// Reads the binding registry from the provider context and displays only
// bindings active in the current scope.

import { useTranslations } from 'next-intl';
import { useContext } from 'react';
import { Dialog } from '@/components/ui/dialog';
import { Kbd } from '@/components/ui/kbd';
import { ShortcutContext } from '@/lib/shortcuts/provider';
import type { Scope } from '@/lib/shortcuts/types';

export type ShortcutOverlayProps = {
  open: boolean;
  onClose: () => void;
};

/** Scope display order and human-readable labels. */
const SCOPE_LABELS: Record<Scope, string> = {
  global: 'Global',
  list: 'List',
  editor: 'Editor',
  review: 'Review',
};

export function ShortcutOverlay({ open, onClose }: ShortcutOverlayProps) {
  const t = useTranslations();
  const ctx = useContext(ShortcutContext);

  if (!ctx) return null;

  const bindings = ctx.getBindings();
  const activeScope = ctx.activeScopes.at(-1) ?? 'global';

  // Group bindings by scope. Only show global + the current screen's scope.
  const relevantScopes: Scope[] =
    activeScope === 'global' ? ['global'] : ['global', activeScope];

  const grouped = relevantScopes
    .map((scope) => ({
      scope,
      label: SCOPE_LABELS[scope],
      items: bindings.filter((b) => b.scope === scope),
    }))
    .filter((group) => group.items.length > 0);

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
      title={t('shortcuts.title')}
      closeLabel={t('common.close')}
    >
      <div className="flex flex-col gap-4">
        {grouped.map((group) => (
          <section key={group.scope}>
            <h3 className="mb-2 text-ui-xs font-medium tracking-ui text-tertiary uppercase">
              {group.label}
            </h3>
            <ul className="flex flex-col">
              {group.items.map((binding) => (
                <li
                  key={binding.id}
                  className="flex h-8 items-center justify-between border-b border-subtle last:border-b-0"
                >
                  <span className="text-ui-sm text-secondary">
                    {resolveLabel(t, binding.label)}
                  </span>
                  <Kbd keys={parseKeyDisplay(binding.keys)} />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </Dialog>
  );
}

/**
 * Convert internal key format to display format.
 * 'mod+k' → ['mod', 'k'], 'g>h' → ['g', 'h'], '?' → ['?']
 */
function parseKeyDisplay(keys: string): string[] {
  if (keys.startsWith('mod+')) {
    return ['mod', keys.slice(4)];
  }
  if (keys.includes('>')) {
    return keys.split('>');
  }
  return [keys];
}

/**
 * Resolve an i18n key to a translated label, falling back to the key itself.
 */
function resolveLabel(
  t: ReturnType<typeof useTranslations>,
  key: string
): string {
  try {
    return t(key); // i18n-dynamic-key
  } catch {
    return key;
  }
}
