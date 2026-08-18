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
  // Root-scoped hook for shared chrome copy (cancel/close).
  const tc = useTranslations('common');
  const tError = useTranslations('error');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function confirm() {
    startTransition(async () => {
      const res = await deleteDeck({ id: deckId });
      if (res.errors?.form) {
        // Resolve catalog keys with static t() calls — a dynamic t(code) is
        // invisible to lint:i18n's key existence check (see course-form.tsx).
        setError(
          res.errors.form === 'deck.hasSubscribers'
            ? t('detail.hasSubscribers')
            : tError('unexpected'),
        );
        return;
      }
      if (res.courseId) {
        router.push(`/app/courses/${res.courseId}`);
      } else {
        router.push('/app');
      }
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
        closeLabel={tc('cancel')}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              {tc('cancel')}
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
