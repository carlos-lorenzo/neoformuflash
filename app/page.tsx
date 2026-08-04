import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

// Server Component: static marketing surface, public, no interactivity.

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

        <Link
          href="/login"
          className="duration-instant mt-8 inline-flex h-11 items-center justify-center rounded-md bg-accent px-6 text-ui-base font-medium text-on-accent transition-colors ease-out hover:bg-accent-hover"
        >
          {t('landing.signIn')}
        </Link>
      </div>
    </main>
  );
}
