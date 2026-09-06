'use client';

// Client: the copy button needs an onClick and the clipboard API.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { CopyIcon, CheckIcon } from '@/components/ui/icon';
import { publicProfileUrl } from '@/lib/public/handle';

/** How long the confirmation stays up. Long enough to read, short enough not to linger. */
const COPIED_MS = 2000;

export function PublicHandleCard({ handle }: { handle: string }) {
  const t = useTranslations('dashboard');
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /*
   * The full URL, not `@handle`. The hint beside this card has always said
   * "Share this link", and the button put a bare handle on the clipboard —
   * pasting it into a chat produced text nobody could click.
   */
  const url = publicProfileUrl(handle);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Clipboard access can be denied (insecure origin, permissions policy).
      // The URL is on screen and selectable, so the copy is recoverable by
      // hand — showing a confirmation that did not happen would not be.
      return;
    }
    setCopied(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setCopied(false), COPIED_MS);
  }, [url]);

  return (
    <div className="rounded-md border border-subtle bg-raised p-3">
      <p className="text-ui-xs font-medium uppercase tracking-eyebrow text-tertiary">
        {t('publicProfileLabel')}
      </p>
      <div className="mt-2 flex items-center gap-2">
        <code className="flex-1 truncate rounded-sm bg-inset px-3 py-2 font-mono text-ui-sm text-secondary">
          {url}
        </code>
        <button
          type="button"
          onClick={copy}
          aria-label={t('copyLink')}
          className="duration-instant flex size-11 items-center justify-center rounded-sm bg-inset text-secondary transition-colors ease-out hover:bg-subtle hover:text-primary"
        >
          {copied ? <CheckIcon className="text-success" /> : <CopyIcon />}
        </button>
      </div>
      {/*
        Announced rather than drawn as a toast: there is no toast system in this
        app, and a live region is the accessible half of the feedback anyway.
      */}
      <p aria-live="polite" className="mt-2 text-ui-xs text-tertiary">
        {copied ? t('copied') : t('publicProfileHint')}
      </p>
    </div>
  );
}
