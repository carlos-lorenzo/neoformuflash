import { redirect } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { DEFAULT_LOCALE, isLocale } from '@neoformuflash/contracts';
import { AppShell } from '@/components/layout/app-shell';
import { SettingsMenu } from '@/components/settings-menu';
import { resolveAppEntry } from '@/lib/app-entry';
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

  const entry = resolveAppEntry(await getProfile(user.id));

  if (entry.kind === 'login') {
    /*
     * The profile read failed (schema drift, RLS, transient) — but the row may
     * still exist, and /onboarding would then bounce straight back here. That
     * was an infinite redirect loop in production. Never send a user to
     * onboarding — nor to /login, which the middleware bounces straight back to
     * /app for a signed-in user — unless we know there is no row. Render.
     */
    const t = await getTranslations('error');
    console.error('getProfile failed', entry.cause);
    return (
      <main className="ruled-grid flex min-h-screen flex-col items-center justify-center px-4">
        <div className="w-full max-w-auth rounded-lg border border-subtle bg-raised p-6">
          {/* i18n-exempt — brand name */}
          <p className="text-ui-sm font-medium text-secondary">FormuFlash</p>
          <p role="alert" className="mt-2 text-ui-base text-danger">
            {t('unexpected')}
          </p>
        </div>
      </main>
    );
  }

  // Signed in but no profile means onboarding was abandoned partway. hasProfile
  // is false there too, so this redirect does not bounce back.
  if (entry.kind === 'onboarding') redirect('/onboarding');

  const { profile } = entry;

  const [theme, collapsed, locale] = await Promise.all([
    getThemeChoice(),
    getSidebarCollapsed(),
    getLocale(),
  ]);

  return (
    <AppShell
      collapsed={collapsed}
      keyboardShortcutsEnabled={profile.keyboardShortcutsEnabled}
      actions={
        <SettingsMenu theme={theme} locale={isLocale(locale) ? locale : DEFAULT_LOCALE} />
      }
    >
      {children}
    </AppShell>
  );
}
