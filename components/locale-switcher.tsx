'use client';

// Client: writes the choice through a server action and reloads.

import { useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { LOCALES, type Locale } from '@neoformuflash/contracts';
import { setLocale } from '@/app/actions/preferences';
import { Select } from '@/components/ui/select';

/*
 * Changing the interface language writes the cookie and, when signed in,
 * `profiles.locale` — so the choice follows the student to another browser
 * rather than living only on this device.
 *
 * No URL involvement at all. Public content pages are not locale-prefixed
 * (decision 7); switching language must never change the address of a note.
 */
export function LocaleSwitcher({ value }: { value: Locale }) {
  const t = useTranslations('locale');
  const [pending, startTransition] = useTransition();

  return (
    <Select
      label={t('label')}
      placeholder={t('label')}
      emptyLabel={t('label')}
      value={value}
      disabled={pending}
      options={LOCALES.map((locale) => ({ value: locale, label: t(locale) }))}
      onValueChange={(next) => {
        startTransition(async () => {
          await setLocale(next);
          // The catalog is chosen during server render, so a reload is what
          // makes the new language authoritative rather than patched in.
          window.location.reload();
        });
      }}
    />
  );
}
