import { getTranslations } from 'next-intl/server';
import { AuthShell } from '@/components/auth/auth-shell';
import { EmailPasswordSignUpForm } from '@/components/auth/email-password-sign-up-form';
import { GoogleSignInButton } from '@/components/google-sign-in-button';

/*
 * Server Component: only the form's pending state and the OAuth button need the
 * browser. refs/06-auth: the signup screen lists OAuth first (low-friction,
 * secondary styling), then the email form — exactly one primary, the email
 * submit (§7). The email form swaps for a "check your email" panel when
 * confirmations are enabled.
 */

export const metadata = {
  robots: { index: false },
};

export default async function SignupPage() {
  const t = await getTranslations('signup');

  return (
    <AuthShell mode="signup">
      <h1 className="mt-6 text-ui-xl font-semibold text-primary">{t('title')}</h1>
      <p className="mt-2 text-ui-sm text-secondary">{t('subtitle')}</p>

      <div className="mt-6">
        <GoogleSignInButton label={t('google')} variant="secondary" />
      </div>

      <div className="mt-6 flex items-center gap-3" aria-hidden="true">
        <span className="h-px flex-1 bg-subtle" />
        <span className="text-ui-xs tracking-ui text-tertiary">{t('divider')}</span>
        <span className="h-px flex-1 bg-subtle" />
      </div>

      <EmailPasswordSignUpForm className="mt-6" />

      <p className="mt-6 text-ui-xs tracking-ui text-tertiary">{t('legal')}</p>
    </AuthShell>
  );
}
