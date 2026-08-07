import { getTranslations } from 'next-intl/server';
import { AuthShell } from '@/components/auth/auth-shell';
import { EmailPasswordSignInForm } from '@/components/auth/email-password-sign-in-form';
import { GoogleSignInButton } from '@/components/google-sign-in-button';

/*
 * Server Component: only the OAuth button and the form's pending state need the
 * browser. refs/06-auth: the returning-user screen leads with the primary path
 * (email + password), OAuth below it.
 */

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
    <AuthShell mode="login">
      <h1 className="mt-6 text-ui-xl font-semibold text-primary">{t('title')}</h1>
      <p className="mt-2 text-ui-sm text-secondary">{t('subtitle')}</p>

      {error ? (
        <p role="alert" className="mt-4 text-ui-sm text-danger">
          {t('failed')}
        </p>
      ) : null}

      {/* The email submit is the single primary (§7); Google below it is secondary. */}
      <EmailPasswordSignInForm className="mt-6" />

      <div className="mt-6 flex items-center gap-3" aria-hidden="true">
        <span className="h-px flex-1 bg-subtle" />
        <span className="text-ui-xs tracking-ui text-tertiary">{t('divider')}</span>
        <span className="h-px flex-1 bg-subtle" />
      </div>

      <div className="mt-6">
        <GoogleSignInButton label={t('google')} variant="secondary" />
      </div>

      <p className="mt-6 text-ui-xs tracking-ui text-tertiary">{t('legal')}</p>
    </AuthShell>
  );
}
