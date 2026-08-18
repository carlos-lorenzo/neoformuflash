// Client: changed-card dialog (Keep my progress / Start over).

'use client';

import { useTranslations } from 'next-intl';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

export type ChangedCardDialogProps = {
  open: boolean;
  onClose: () => void;
  onKeep: () => void;
  onStartOver: () => void;
};

export function ChangedCardDialog({
  open,
  onClose,
  onKeep,
  onStartOver,
}: ChangedCardDialogProps) {
  const t = useTranslations('review');
  // Root-scoped hook for shared chrome copy (cancel/close).
  const tc = useTranslations('common');

  return (
    <Dialog
      open={open}
      onOpenChange={onClose}
      title={t('changedCard.title')}
      description={t('changedCard.body')}
      closeLabel={tc('close')}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => { onClose(); onKeep(); }}>
            {t('changedCard.keep')}
          </Button>
          <Button variant="primary" onClick={() => { onClose(); onStartOver(); }}>
            {t('changedCard.startOver')}
          </Button>
        </div>
      }
    >
      <p>{t('changedCard.body')}</p>
    </Dialog>
  );
}