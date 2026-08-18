'use client';

// Client: reads the current choice and writes it back through a server action.

import { useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { setTheme } from '@/app/actions/preferences';
import { THEME_CHOICES, type ThemeChoice } from '@/lib/theme';
import { cn } from '@/lib/cn';

/*
 * A three-way segmented control rather than a two-way switch, because 'system'
 * is a real answer and hiding it behind a long-press is how people end up with
 * a light app inside a dark OS at 11pm.
 *
 * The server writes the cookie and re-renders, so the attribute on <html> is
 * always the server's, never something patched in afterwards on the client.
 */
export function ThemeToggle({ value }: { value: ThemeChoice }) {
  const t = useTranslations('theme');
  const [pending, startTransition] = useTransition();

  return (
    <div
      role="radiogroup"
      aria-label={t('label')}
      className="inline-flex gap-1 rounded-md border border-subtle p-1"
    >
      {THEME_CHOICES.map((choice) => {
        const selected = choice === value;

        return (
          <button
            key={choice}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={pending}
            onClick={() => {
              startTransition(async () => {
                await setTheme(choice);
                // The <html> attribute is server-rendered, so the choice only
                // takes visual effect after this refresh. That is deliberate:
                // one source of truth beats a client patch that can disagree.
                window.location.reload();
              });
            }}
            className={cn(
              // h-11 (44px) at every width, not h-8. AC 6 requires ≥44px
              // targets at 390px and this control lives in the settings dialog,
              // which is part of the shell there. One height rather than a
              // responsive pair, for the reason settings-menu.tsx gives: the
              // same affordance everywhere is one layout to verify.
              'duration-instant h-11 rounded-sm px-3 text-ui-sm transition-colors ease-out',
              selected
                ? 'bg-accent-quiet font-medium text-primary'
                : 'text-secondary hover:text-primary'
            )}
          >
            {t(choice) /* i18n-dynamic-key */}
          </button>
        );
      })}
    </div>
  );
}
