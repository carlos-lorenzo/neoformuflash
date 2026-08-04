// Server Component: structure only. The interactive bits it renders
// (sidebar toggle, theme, locale) are their own client components.

import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { cn } from '@/lib/cn';
import { SidebarToggle } from './sidebar-toggle';

/*
 * §6: a fixed left sidebar (240px, collapsible to a 56px icon rail), a content
 * column, and an optional outline rail at ≥1440px that phase 02 will use.
 *
 * At 390px the sidebar is not a narrow rail — it is off-canvas entirely. A
 * 56px rail on a 390px screen eats 14% of the width to show icons nobody can
 * label, and the mobile surfaces (reader, review) are single-purpose anyway.
 */

export type AppShellProps = {
  children: React.ReactNode;
  /** Rendered top-right: theme toggle, locale switcher, account. */
  actions?: React.ReactNode;
  collapsed?: boolean;
};

export async function AppShell({ children, actions, collapsed = false }: AppShellProps) {
  const t = await getTranslations('nav');

  /*
   * Only routes that exist. Notes, decks and review arrive with phases 02 and
   * 03 and add their own entries here.
   *
   * `typedRoutes` makes this a compile error rather than a judgement call: a
   * link to an unbuilt route fails the build, so a dead nav item cannot ship.
   */
  const navItems = [{ href: '/app', label: t('dashboard') }] as const;

  return (
    <div className="flex min-h-screen bg-base">
      <aside
        data-collapsed={collapsed ? '' : undefined}
        className={cn(
          // Hidden below tablet; the mobile nav is the bottom bar below.
          'hidden shrink-0 border-r border-subtle bg-raised tablet:flex tablet:flex-col',
          collapsed ? 'tablet:w-sidebar-rail' : 'tablet:w-sidebar'
        )}
      >
        <div className="flex h-12 items-center gap-2 border-b border-subtle px-3">
          {/* i18n-exempt — the brand name is the same in every language */}
          <span className="truncate text-ui-base font-semibold text-primary">FormuFlash</span>
        </div>

        <nav aria-label={t('dashboard')} className="flex flex-1 flex-col gap-1 p-2">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'duration-instant flex h-8 items-center rounded-sm px-2 text-ui-sm text-secondary transition-colors ease-out',
                'hover:bg-inset hover:text-primary'
              )}
            >
              <span className={cn('truncate', collapsed && 'tablet:sr-only')}>{item.label}</span>
            </Link>
          ))}
        </nav>

        <div className="border-t border-subtle p-2">
          <SidebarToggle collapsed={collapsed} />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-subtle px-4 tablet:px-6">
          {/* i18n-exempt — brand name, shown only where the sidebar is hidden */}
          <span className="text-ui-base font-semibold text-primary tablet:sr-only">FormuFlash</span>
          <div className="flex items-center gap-2">{actions}</div>
        </header>

        {/* min-w-0 on every ancestor is what stops a wide child forcing
            horizontal scroll at 390px (AC 6). */}
        <main className="min-w-0 flex-1 p-4 tablet:p-6">{children}</main>

        <nav
          aria-label={t('dashboard')}
          className="flex shrink-0 items-stretch border-t border-subtle bg-raised tablet:hidden"
        >
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              // 44px minimum touch target at 390px (AC 6).
              className="flex h-11 min-w-11 flex-1 items-center justify-center px-2 text-ui-xs tracking-ui text-secondary"
            >
              <span className="truncate">{item.label}</span>
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}
