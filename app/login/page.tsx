import { getTranslations } from 'next-intl/server';
import { GoogleSignInButton } from '@/components/google-sign-in-button';

// Server Component: only the OAuth button needs the browser.

export const metadata = {
  robots: { index: false },
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const t = await getTranslations('login');
  const { error } = await searchParams;

  return (
    /*
     * refs/06-auth: chrome stripped, a single centred column capped around
     * 400px so the button text and inputs do not stretch. The ruled grid (§8)
     * appears behind the auth screen — one of its three permitted places.
     */
    <main className="ruled-grid flex min-h-screen flex-col items-center justify-center px-4">
      <div className="w-full max-w-auth rounded-lg border border-subtle bg-raised p-6">
        {/* i18n-exempt — brand name */}
        <p className="text-ui-sm font-medium text-secondary">FormuFlash</p>

        <h1 className="mt-2 text-ui-xl font-semibold text-primary">{t('title')}</h1>
        <p className="mt-2 text-ui-sm text-secondary">{t('subtitle')}</p>

        {error ? (
          <p role="alert" className="mt-4 text-ui-sm text-danger">
            {t('failed')}
          </p>
        ) : null}

        <div className="mt-6">
          <GoogleSignInButton label={t('google')} />
        </div>

        <p className="mt-6 text-ui-xs tracking-ui text-tertiary">{t('legal')}</p>
      </div>
    </main>
  );
}
