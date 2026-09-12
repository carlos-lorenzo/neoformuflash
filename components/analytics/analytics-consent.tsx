'use client';

import { useCallback, useState, useSyncExternalStore } from 'react';
import Script from 'next/script';
import { useTranslations } from 'next-intl';

const STORAGE_KEY = 'ff-ga-consent';
const FALLBACK_ID = 'G-CTXECP8W5H';

type Consent = 'unknown' | 'granted' | 'denied';

function readStored(): Consent {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === 'granted' || raw === 'denied') return raw;
  } catch {
    // Private mode / blocked storage — treat as undecided, never load GA.
  }
  return 'unknown';
}

/*
 * localStorage is an external store: it is read through useSyncExternalStore
 * (server snapshot 'unknown') rather than a useState initializer or an effect
 * read. That keeps server prerender, hydration and client re-renders
 * consistent without a cascading setState-in-effect.
 */
function subscribeConsent(callback: () => void): () => void {
  window.addEventListener('storage', callback);
  return () => window.removeEventListener('storage', callback);
}

function getConsentSnapshot(): Consent {
  return readStored();
}

function getServerConsentSnapshot(): Consent {
  return 'unknown';
}

export function AnalyticsConsent() {
  const t = useTranslations('analytics');
  const stored = useSyncExternalStore(subscribeConsent, getConsentSnapshot, getServerConsentSnapshot);
  // Same-tab choice: the 'storage' event does not fire in the tab that wrote
  // it, so the in-memory override carries the decision until reload.
  const [override, setOverride] = useState<Consent | null>(null);
  const consent = override ?? stored;

  const choose = useCallback((value: 'granted' | 'denied') => {
    try {
      window.localStorage.setItem(STORAGE_KEY, value);
    } catch {
      // Storage unavailable — still respect the in-memory choice for this visit.
    }
    setOverride(value);
  }, []);

  const measurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID || FALLBACK_ID;

  return (
    <>
      {consent === 'granted' ? (
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${measurementId}`}
            strategy="afterInteractive"
          />
          <Script id="ga-init" strategy="afterInteractive">
            {`window.dataLayer = window.dataLayer || [];function gtag(){dataLayer.push(arguments);}gtag('js', new Date());gtag('config', '${measurementId}');`}
          </Script>
        </>
      ) : null}
      {consent === 'unknown' ? (
        <div
          role="dialog"
          aria-label={t('banner.title')}
          className="duration-fast fixed right-4 bottom-4 left-4 z-50 mx-auto w-full max-w-md rounded-md border border-subtle bg-overlay p-4 shadow-overlay"
        >
          <p className="text-ui-sm font-medium text-primary">{t('banner.title')}</p>
          <p className="mt-2 text-ui-sm text-secondary">{t('banner.message')}</p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => choose('denied')}
              className="h-11 flex-1 rounded-md border border-subtle bg-raised px-3 text-ui-sm text-secondary transition-colors hover:text-primary"
            >
              {t('banner.decline')}
            </button>
            <button
              type="button"
              onClick={() => choose('granted')}
              className="h-11 flex-1 rounded-md bg-accent px-3 text-ui-sm text-on-accent transition-colors hover:bg-accent-hover"
            >
              {t('banner.accept')}
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
