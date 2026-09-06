/*
 * Server: the landing header. Brand left; language, theme, sign-in and the
 * start-free CTA right.
 *
 * The theme/language controls only fit a horizontal row from 768px up — below
 * that they move to the footer (see settings-menu history: stacked labels and
 * inline controls in a short header clip at 390px).
 */

import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { DEFAULT_LOCALE, isLocale } from '@neoformuflash/contracts';
import { CtaLink } from '@/components/landing/cta-link';
import { LocaleToggle } from '@/components/landing/locale-toggle';
import { ThemeToggle } from '@/components/theme-toggle';
import { getActiveLocale } from '@/lib/i18n/locale';
import { getThemeChoice } from '@/lib/theme.server';

export async function LandingHeader() {
  const [theme, locale, t] = await Promise.all([
    getThemeChoice(),
    getActiveLocale(),
    getTranslations('landing'),
  ]);

  const shippedLocale = isLocale(locale) ? locale : DEFAULT_LOCALE;

  return (
    <header className="sticky top-0 z-20 border-b border-subtle bg-base">
      <div className="mx-auto flex w-full max-w-deck items-center justify-between gap-3 px-4 py-2 sm:px-6">
        {/* i18n-exempt — the brand name is the same in every language */}
        <Link
          href="/"
          className="inline-flex min-h-11 items-center text-ui-lg font-semibold text-primary transition-colors duration-instant ease-out hover:text-secondary"
        >
          {/* i18n-exempt */}
          FormuFlash
        </Link>

        <div className="flex items-center gap-2">
          <div className="hidden items-center gap-2 md:flex">
            <ThemeToggle value={theme} />
            <LocaleToggle value={shippedLocale} />
          </div>
          <Link
            href="/login"
            className="inline-flex min-h-11 items-center px-3 text-ui-sm font-medium text-secondary transition-colors duration-instant ease-out hover:text-primary"
          >
            {t('signIn')}
          </Link>
          <CtaLink href="/signup">{t('startFree')}</CtaLink>
        </div>
      </div>
    </header>
  );
}
