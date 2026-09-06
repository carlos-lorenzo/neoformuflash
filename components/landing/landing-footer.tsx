/*
 * Server: landing footer. Brand and tagline left; sign-in links right.
 * Language + theme live here below 768px — the header carries them from 768px
 * up (see landing-header.tsx).
 */

import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { DEFAULT_LOCALE, isLocale } from '@neoformuflash/contracts';
import { LocaleToggle } from '@/components/landing/locale-toggle';
import { ThemeToggle } from '@/components/theme-toggle';
import { getActiveLocale } from '@/lib/i18n/locale';
import { getThemeChoice } from '@/lib/theme.server';

export async function LandingFooter() {
  const [theme, locale, t, tb] = await Promise.all([
    getThemeChoice(),
    getActiveLocale(),
    getTranslations('landing'),
    getTranslations('brand'),
  ]);

  const shippedLocale = isLocale(locale) ? locale : DEFAULT_LOCALE;

  return (
    <footer className="border-t border-subtle">
      <div className="mx-auto flex w-full max-w-deck flex-col gap-6 px-4 py-8 sm:px-6 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-col gap-1">
          {/* i18n-exempt — the brand name is the same in every language */}
          <p className="text-ui-base font-semibold text-primary">FormuFlash</p>
          <p className="text-ui-sm text-secondary">{tb('tagline')}</p>
        </div>

        <div className="flex flex-col items-start gap-4 md:items-end">
          <div className="flex items-center gap-2">
            <Link
              href="/login"
              className="inline-flex min-h-11 items-center px-3 text-ui-sm font-medium text-secondary transition-colors duration-instant ease-out hover:text-primary"
            >
              {t('signIn')}
            </Link>
            <Link
              href="/signup"
              className="inline-flex min-h-11 items-center px-3 text-ui-sm font-medium text-secondary transition-colors duration-instant ease-out hover:text-primary"
            >
              {t('startFree')}
            </Link>
          </div>
          <div className="flex flex-col gap-3 md:hidden">
            <ThemeToggle value={theme} />
            <LocaleToggle value={shippedLocale} />
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-deck px-4 pb-8 sm:px-6">
        <p className="text-ui-xs tracking-ui text-tertiary">
          {/* i18n-exempt — a copyright year is a number, not prose */}
          © 2026 FormuFlash
        </p>
      </div>
    </footer>
  );
}
