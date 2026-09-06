import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { CtaLink } from '@/components/landing/cta-link';
import { DemoSession } from '@/components/landing/demo-session';
import { LandingFooter } from '@/components/landing/landing-footer';
import { LandingHeader } from '@/components/landing/landing-header';

/*
 * Server Component: the marketing surface, public. The single client island is
 * the interactive sample session (components/landing/demo-session.tsx) — a
 * self-contained review loop over five hand-authored flashcards, so a visitor
 * feels the product's core motion before committing to an account. Everything
 * else is static copy in the site's own voice.
 *
 * The only h1 on the page is the hero lede (auth.spec asserts exactly one
 * visible level-1 heading at "/").
 */

export const metadata: Metadata = {
  title: 'FormuFlash — Structured notes & spaced repetition for STEM',
  description: 'Structured notes and spaced-repetition flashcards, for STEM degrees.',
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    siteName: 'FormuFlash',
    title: 'FormuFlash — Structured notes & spaced repetition for STEM',
    description: 'Write the derivation once. Review it until it sticks.',
  },
};

export default async function LandingPage() {
  const t = await getTranslations('landing');

  const steps = [
    { title: t('loop.writeTitle'), body: t('loop.writeBody') },
    { title: t('loop.turnTitle'), body: t('loop.turnBody') },
    { title: t('loop.keepTitle'), body: t('loop.keepBody') },
  ];

  return (
    <>
      <LandingHeader />
      <main>
        {/* Hero: the promise on the left, the product's own motion on the right. */}
        <section className="mx-auto w-full max-w-deck px-4 sm:px-6">
          <div className="grid items-start gap-12 py-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-8 lg:py-16 xl:py-24">
            <div className="flex flex-col gap-4">
              <p className="font-mono text-ui-xs font-medium uppercase tracking-eyebrow text-tertiary">
                {t('heroEyebrow')}
              </p>

              <h1 className="font-serif text-read-h1 font-semibold text-balance text-primary">
                {t('lede')}
              </h1>

              <p className="max-w-measure text-ui-base text-secondary">{t('heroBody')}</p>

              <div className="mt-2 flex flex-wrap items-center gap-3">
                <CtaLink href="/signup">{t('startFree')}</CtaLink>
                <CtaLink href="/login" variant="secondary">
                  {t('signIn')}
                </CtaLink>
              </div>

              <p className="text-ui-sm text-tertiary">{t('heroCaption')}</p>
            </div>

            <div className="lg:pl-2">
              <DemoSession />
              <p className="mt-3 max-w-measure text-ui-xs tracking-ui text-tertiary">
                {t('demo.hint')}
              </p>
            </div>
          </div>
        </section>

        {/* The loop: what the product actually is, in three beats. */}
        <section className="border-t border-subtle">
          <div className="mx-auto w-full max-w-deck px-4 py-16 sm:px-6 lg:py-24">
            <h2 className="font-serif text-read-h2 font-semibold text-balance text-primary">
              {t('loop.title')}
            </h2>

            <ol className="mt-8 grid gap-8 md:grid-cols-3">
              {steps.map((step, i) => (
                <li key={step.title} className="flex flex-col gap-2 border-t border-subtle pt-4">
                  <span className="font-mono text-ui-sm text-tertiary">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <h3 className="text-ui-lg font-semibold text-primary">{step.title}</h3>
                  <p className="text-ui-sm text-secondary">{step.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Closing: the ask, in one line. */}
        <section className="border-t border-subtle">
          <div className="mx-auto flex w-full max-w-measure flex-col items-center gap-4 px-4 py-16 text-center sm:px-6 lg:py-24">
            <h2 className="font-serif text-read-h2 font-semibold text-balance text-primary">
              {t('closing.title')}
            </h2>
            <p className="text-ui-base text-secondary">{t('closing.body')}</p>
            <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
              <CtaLink href="/signup">{t('startFree')}</CtaLink>
              <CtaLink href="/login" variant="secondary">
                {t('signIn')}
              </CtaLink>
            </div>
          </div>
        </section>
      </main>
      <LandingFooter />
    </>
  );
}
