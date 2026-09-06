'use client';

// Client: owns the dialog's open state.

import { useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { Locale } from '@neoformuflash/contracts';
import { Dialog } from '@/components/ui/dialog';
import { KeyIcon } from '@/components/ui/icon';
import { LocaleSwitcher } from '@/components/locale-switcher';
import { ThemeToggle } from '@/components/theme-toggle';
import { SignOutButton } from '@/components/sign-out-button';
import type { ThemeChoice } from '@/lib/theme';

/*
 * Language, theme, API keys and sign-out behind one control.
 *
 * The gear is the app's only persistent chrome control now that the sidebar is
 * gone, so it carries everything a student reaches for outside their content:
 * the theme segmented control, the language picker, the API Keys page (which
 * used to be a sidebar item) and sign-out. One 44px trigger at every width,
 * one layout to verify (settings-menu history: inline header controls clipped
 * at 390px and three stacked labels did not fit a 48px header).
 */
export function SettingsMenu({ theme, locale }: { theme: ThemeChoice; locale: Locale }) {
  const t = useTranslations('nav');
  const themeT = useTranslations('theme');
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
          <div>
            <p className="text-ui-sm font-medium text-secondary">{themeT('label')}</p>
            <div className="mt-2">
              <ThemeToggle value={theme} />
            </div>
          </div>

          <LocaleSwitcher value={locale} />

          <Link
            href="/app/settings/ai-keys"
            onClick={() => setOpen(false)}
            className="duration-instant flex h-11 items-center gap-3 rounded-md px-3 text-ui-sm text-secondary transition-colors ease-out hover:bg-raised hover:text-primary"
          >
            <KeyIcon className="shrink-0 text-tertiary" />
            <span className="flex-1 truncate">{t('aiKeys')}</span>
            {/* i18n-exempt — a chevron, not a word */}
            <span aria-hidden="true" className="text-tertiary">
              ›
            </span>
          </Link>

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
