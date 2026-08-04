import { redirect } from 'next/navigation';
import { getLocale } from 'next-intl/server';
import { DEFAULT_LOCALE, isLocale } from '@neoformuflash/contracts';
import { AppShell } from '@/components/layout/app-shell';
import { SettingsMenu } from '@/components/settings-menu';
import { getProfile } from '@/lib/db/profiles';
import { getSidebarCollapsed } from '@/lib/preferences';
import { getSessionUser } from '@/lib/supabase/session';
import { getThemeChoice } from '@/lib/theme.server';

/*
 * Authenticated surfaces are noindex. Per decision 7 they also take their locale
 * from the profile with no URL involvement at all — there is no /es/ prefix
 * here and there never will be.
 */
export const metadata = {
  robots: { index: false, follow: false },
};

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect('/login');

  const profile = await getProfile(user.id);
  // Signed in but no profile means onboarding was abandoned partway.
  if (!profile) redirect('/onboarding');

  const [theme, collapsed, locale] = await Promise.all([
    getThemeChoice(),
    getSidebarCollapsed(),
    getLocale(),
  ]);

  return (
    <AppShell
      collapsed={collapsed}
      actions={
        <SettingsMenu theme={theme} locale={isLocale(locale) ? locale : DEFAULT_LOCALE} />
      }
    >
      {children}
    </AppShell>
  );
}
