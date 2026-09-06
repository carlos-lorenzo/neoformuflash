'use client';

// Client: a compact two-up language control for the marketing header/footer.
//
// The app's canonical LocaleSwitcher is a labelled <select> — right for a
// settings dialog, too tall for a header row beside a 44px segmented theme
// control. This mirrors ThemeToggle's segmented form (same 44px targets, same
// server-action write, same reload) so the two sit flush together.

import { useTransition } from 'react';
import { useTranslations } from 'next-intl';
import type { Locale } from '@neoformuflash/contracts';
import { setLocale } from '@/app/actions/preferences';
import { SHIPPED_LOCALES } from '@/lib/i18n/shipped';
import { cn } from '@/lib/cn';

export function LocaleToggle({ value }: { value: Locale }) {
  const t = useTranslations('locale');
  const [pending, startTransition] = useTransition();

  return (
    <div
      role="radiogroup"
      aria-label={t('label')}
      className="inline-flex gap-1 rounded-md border border-subtle p-1"
    >
      {SHIPPED_LOCALES.map((locale) => {
        const selected = locale === value;

        return (
          <button
            key={locale}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={pending}
            onClick={() => {
              startTransition(async () => {
                await setLocale(locale);
                // The catalog is chosen during server render, so a reload is
                // what makes the new language authoritative rather than patched.
                window.location.reload();
              });
            }}
            className={cn(
              'duration-instant h-11 rounded-sm px-3 text-ui-sm transition-colors ease-out',
              selected ? 'bg-accent-quiet font-medium text-primary' : 'text-secondary hover:text-primary'
            )}
          >
            {t(locale) /* i18n-dynamic-key */}
          </button>
        );
      })}
    </div>
  );
}
