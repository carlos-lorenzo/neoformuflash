// Client: confirms then deletes a deck (owner only).

'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { deleteDeck } from '@/app/app/decks/actions';

export function DeleteDeckButton({ deckId }: { deckId: string }) {
  const t = useTranslations('decks');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function confirm() {
    startTransition(async () => {
      const res = await deleteDeck({ id: deckId });
      if (res.errors?.form) {
        setError(res.errors.form);
        return;
      }
      router.push('/app/decks');
    });
  }

  return (
    <>
      <Button variant="destructive" onClick={() => setOpen(true)}>
        {t('detail.delete')}
      </Button>

      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={t('detail.deleteConfirm')}
        closeLabel={t('common.cancel')}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button variant="destructiveFilled" onClick={confirm} loading={pending}>
              {t('detail.delete')}
            </Button>
          </div>
        }
      >
        {error ? <p className="text-ui-sm text-danger">{error}</p> : null}
      </Dialog>
    </>
  );
}
