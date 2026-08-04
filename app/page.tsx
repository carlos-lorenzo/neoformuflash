import { getTranslations } from 'next-intl/server';
import { GoogleSignInButton } from '@/components/google-sign-in-button';

/*
 * Server Component: static marketing surface, public. The one client island is
 * the sign-in button, which has to start OAuth in the browser so the PKCE
 * verifier has somewhere to live.
 *
 * It is the real button, not a link to /login. A control that says "Sign in
 * with Google" signs you in with Google — sending it to a page with a second
 * button that does the actual thing makes the label a lie and costs a click.
 */

export default async function LandingPage() {
  const t = await getTranslations();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 py-16">
      <div className="flex w-full max-w-measure flex-col items-center text-center">
        {/* i18n-exempt — the brand name is the same in every language */}
        <p className="text-ui-sm font-medium text-secondary">FormuFlash</p>

        <h1 className="mt-3 font-serif text-read-h1 font-semibold text-balance text-primary">
          {t('landing.lede')}
        </h1>

        <p className="mt-4 max-w-measure text-ui-base text-secondary">{t('brand.tagline')}</p>

        <div className="mt-8 w-full max-w-auth">
          <GoogleSignInButton label={t('landing.signIn')} />
        </div>
      </div>
    </main>
  );
}
