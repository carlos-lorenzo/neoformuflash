import type { Metadata } from 'next';
import { Geist, Geist_Mono, Source_Serif_4 } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import { SYSTEM_THEME_SCRIPT } from '@/lib/theme';
import { getThemeChoice } from '@/lib/theme.server';
import { AnalyticsConsent } from '@/components/analytics/analytics-consent';
import '@/styles/globals.css';

/*
 * next/font downloads these at build time and serves them from our own origin.
 * There is no Google Fonts request at runtime, per design-system.md §2.
 *
 * The serif is not decoration: KaTeX renders in Computer Modern, a serif, so a
 * sans reading face makes every inline equation look pasted in from another
 * document. This pairing is the most important type decision in the product.
 */
const geistSans = Geist({ subsets: ['latin'], variable: '--font-geist-sans', display: 'swap' });
const geistMono = Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono', display: 'swap' });
const sourceSerif = Source_Serif_4({
  subsets: ['latin'],
  variable: '--font-source-serif',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'FormuFlash',
  description: 'Structured notes and spaced repetition, for STEM degrees.',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [theme, locale, messages] = await Promise.all([
    getThemeChoice(),
    getLocale(),
    getMessages(),
  ]);

  /*
   * Both the theme and the language are decided here, on the server, before any
   * HTML exists. That is what makes "no flash of the wrong theme" (AC 5) and
   * "no flash of the wrong language" (AC 1c) true by construction rather than
   * by winning a race against hydration.
   *
   * 'system' is the one case the server cannot answer, because only the browser
   * knows the OS preference — hence the small blocking script below, rendered
   * only in that case.
   */
  const resolvedTheme = theme === 'system' ? undefined : theme;

  return (
    <html
      lang={locale}
      data-theme={resolvedTheme}
      className={`${geistSans.variable} ${geistMono.variable} ${sourceSerif.variable}`}
      suppressHydrationWarning
    >
      <head>
        {theme === 'system' ? (
          <script dangerouslySetInnerHTML={{ __html: SYSTEM_THEME_SCRIPT }} />
        ) : null}
      </head>
      <body>
        <NextIntlClientProvider locale={locale} messages={messages}>
          {children}
          <AnalyticsConsent />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
