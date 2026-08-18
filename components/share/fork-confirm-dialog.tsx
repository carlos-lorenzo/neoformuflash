'use client';

import { useTranslations } from 'next-intl';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface ForkConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  targetType: 'course' | 'deck';
  statesCarried?: number;
  loading?: boolean;
}

export function ForkConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
  targetType,
  statesCarried,
  loading = false,
}: ForkConfirmDialogProps) {
  const t = useTranslations('publicProfile.share');
  const tc = useTranslations('common');

  const typeLabel = t(targetType); // i18n-dynamic-key — targetType is a known enum; keys exist

  const body = statesCarried && statesCarried > 0
    ? t('forkConfirmBody', { type: typeLabel, statesCarried })
    : t('forkConfirmBodyNoProgress', { type: typeLabel });

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('forkConfirmTitle', { type: typeLabel })}
      description={body}
      closeLabel={tc('close')}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={loading}>
            {tc('cancel')}
          </Button>
          <Button
            variant="primary"
            loading={loading}
            loadingLabel={t('forking')}
            onClick={async () => {
              await onConfirm();
              onOpenChange(false);
            }}
          >
            {t('fork')}
          </Button>
        </div>
      }
    >
      <div />
    </Dialog>
  );
}