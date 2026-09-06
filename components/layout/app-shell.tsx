// Server Component: structure only. The interactive bits it renders (theme,
// locale, account) are their own client components.

import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { cn } from '@/lib/cn';
import { ShortcutManager } from '@/lib/shortcuts/shortcut-manager';

/*
 * The app chrome is a single top bar — there is no sidebar.
 *
 * The Home and Courses pages were merged into one dashboard (/app), and the
 * remaining destination of consequence (course/deck detail, review, AI keys)
 * is reached from within the dashboard or from the settings gear. A fixed left
 * sidebar had two links with nothing else to grow into, so it became chrome
 * that taxed every deeper page (a 240px rail beside a 390px reader is 60% of
 * the screen) for navigation the brand already provides: the FormuFlash mark
 * is a link home, and detail pages carry their own breadcrumbs.
 */

export type AppShellProps = {
  children: React.ReactNode;
  /** Rendered top-right: the settings gear (theme, locale, API keys, account). */
  actions?: React.ReactNode;
  /** Per-user toggle for bare-letter shortcuts (default true). */
  keyboardShortcutsEnabled?: boolean;
};

export async function AppShell({ children, actions, keyboardShortcutsEnabled = true }: AppShellProps) {
  const t = await getTranslations('nav');

  return (
    <ShortcutManager enabled={keyboardShortcutsEnabled}>
      <div className="flex min-h-screen flex-col bg-base">
        <header className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-subtle px-4 tablet:px-6">
          {/* The brand is the way home from any app surface: no sidebar, so no
              other persistent Home control exists at tablet width and up. The
              h-11 hit area keeps it a legal 44px target at 390px (AC 6). */}
          <Link
            href="/app"
            aria-label={t('dashboard')}
            className={cn(
              'duration-instant flex h-11 items-center rounded-md text-ui-base font-semibold text-primary transition-colors ease-out hover:text-accent'
            )}
          >
            {/* i18n-exempt — the brand name is the same in every language */}
            <span className="truncate">FormuFlash</span>
          </Link>

          <div className="flex items-center gap-2">{actions}</div>
        </header>

        {/* min-w-0 on every ancestor is what stops a wide child forcing
            horizontal scroll at 390px (AC 6). */}
        <main className="min-w-0 flex-1 p-4 tablet:p-6">{children}</main>
      </div>
    </ShortcutManager>
  );
}
