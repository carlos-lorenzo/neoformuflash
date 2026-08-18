'use client';

// Client: owns the dialog's open state.

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { Locale } from '@neoformuflash/contracts';
import { Dialog } from '@/components/ui/dialog';
import { LocaleSwitcher } from '@/components/locale-switcher';
import { ThemeToggle } from '@/components/theme-toggle';
import { SignOutButton } from '@/components/sign-out-button';
import type { ThemeChoice } from '@/lib/theme';

/*
 * Language, theme and sign-out behind one control.
 *
 * They started out inline in the header. At 390px that produced a clipped
 * "Language" label, "Sign out" wrapped onto two lines, and the whole row
 * crushed against the brand — the header is 48px of dense chrome and three
 * stacked-label controls do not fit in it. The screenshots caught this; the
 * code read fine.
 *
 * One 44px trigger at every width, rather than a menu on mobile and an inline
 * row on desktop: the same affordance everywhere is easier to teach and there
 * is only one layout to verify.
 */
export function SettingsMenu({ theme, locale }: { theme: ThemeChoice; locale: Locale }) {
  const t = useTranslations('nav');
  const common = useTranslations('common');
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t('settings')}
        className="duration-instant flex size-11 items-center justify-center rounded-md text-secondary transition-colors ease-out hover:bg-raised hover:text-primary"
      >
        <GearIcon />
      </button>

      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={t('settings')}
        closeLabel={common('close')}
      >
        <div className="flex flex-col gap-6">
          <LocaleSwitcher value={locale} />
          <ThemeToggle value={theme} />
          <div className="border-t border-subtle pt-4">
            <SignOutButton />
          </div>
        </div>
      </Dialog>
    </>
  );
}

function GearIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className="size-4 icon-inline"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <circle cx="8" cy="8" r="2.25" />
      <path d="M8 1.5v1.75M8 12.75v1.75M14.5 8h-1.75M3.25 8H1.5M12.6 3.4l-1.25 1.25M4.65 11.35 3.4 12.6M12.6 12.6l-1.25-1.25M4.65 4.65 3.4 3.4" strokeLinecap="round" />
    </svg>
  );
}
