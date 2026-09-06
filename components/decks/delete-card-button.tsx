'use client';

/*
 * Confirms, then deletes one card. Mirrors delete-deck-button.tsx.
 *
 * The failure that must reach the student: a BEFORE DELETE trigger blocks
 * deleting a card that other users hold card_states for, raising P0001, which
 * the action maps to `card.hasSubscribers`. Silently doing nothing there would
 * look exactly like a broken button.
 */

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';

export function DeleteCardButton({
  index,
  errorCode,
  onConfirm,
}: {
  /** 1-based row number, for the accessible name. */
  index: number;
  errorCode: string | null;
  onConfirm: () => Promise<void>;
}) {
  const t = useTranslations('decks');
  const tc = useTranslations('common');
  const tError = useTranslations('error');
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  /*
   * Catalog keys resolved with STATIC t() calls. A dynamic t(code) is
   * invisible to scripts/lint-i18n.mjs's key-existence check, which is how
   * ~20 unresolvable keys shipped in phase 03 (EVOLUTION 2026-08-08).
   */
  const message =
    errorCode === 'card.hasSubscribers'
      ? t('cardList.hasSubscribers')
      : errorCode
        ? tError('unexpected')
        : null;

  async function confirm() {
    setPending(true);
    await onConfirm();
    setPending(false);
    setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t('cardGrid.deleteCard', { index })}
        className="duration-instant flex size-11 items-center justify-center rounded-sm text-tertiary transition-colors ease-out hover:bg-subtle hover:text-danger"
      >
        <span aria-hidden="true">×</span>
      </button>

      {message ? (
        <p role="alert" className="text-ui-xs text-danger">
          {message}
        </p>
      ) : null}

      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={t('cardList.delete')}
        closeLabel={tc('close')}
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={pending}>
              {tc('cancel')}
            </Button>
            <Button variant="destructiveFilled" onClick={confirm} loading={pending}>
              {t('cardList.delete')}
            </Button>
          </>
        }
      >
        <p className="text-ui-sm text-secondary">{t('cardList.deleteConfirm')}</p>
      </Dialog>
    </>
  );
}
