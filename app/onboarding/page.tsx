import { redirect } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { DEFAULT_LOCALE, isLocale } from '@neoformuflash/contracts';
import { listInstitutions } from '@/lib/db/institutions';
import { hasProfile } from '@/lib/db/profiles';
import { getSessionUser } from '@/lib/supabase/session';
import { OnboardingForm } from './onboarding-form';

// Server Component: fetches the taxonomy and the Google-supplied name.

export const metadata = {
  robots: { index: false },
};

export default async function OnboardingPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');

  // First-run only (AC 2). A returning user never sees this screen.
  if (await hasProfile(user.id)) redirect('/app');

  const [t, locale, institutions] = await Promise.all([
    getTranslations('onboarding'),
    getLocale(),
    listInstitutions(),
  ]);

  const metadata = user.user_metadata as Record<string, unknown> | undefined;
  // Google supplies full_name; email signups supply display_name (set at signup
  // from the email local part). Fall back to a blank field either way.
  const suggestedName =
    pickString(metadata?.['full_name']) ??
    pickString(metadata?.['name']) ??
    pickString(metadata?.['display_name']) ??
    '';

  return (
    <main className="ruled-grid flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-auth rounded-lg border border-subtle bg-raised p-6">
        <h1 className="text-ui-xl font-semibold text-primary">{t('title')}</h1>
        <p className="mt-2 text-ui-sm text-secondary">{t('subtitle')}</p>

        <OnboardingForm
          className="mt-6"
          suggestedName={suggestedName}
          locale={isLocale(locale) ? locale : DEFAULT_LOCALE}
          institutions={institutions}
          labels={{
            displayName: t('displayName.label'),
            displayNamePlaceholder: t('displayName.placeholder'),
            institution: t('institution.label'),
            institutionPlaceholder: t('institution.placeholder'),
            institutionOther: t('institution.other'),
            institutionOtherLabel: t('institution.otherLabel'),
            institutionOtherHint: t('institution.otherHint'),
            degree: t('degree.label'),
            degreePlaceholder: t('degree.placeholder'),
            degreeEmpty: t('degree.empty'),
            submit: t('submit'),
          }}
        />
      </div>
    </main>
  );
}

function pickString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}
