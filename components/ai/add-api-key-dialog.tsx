'use client';

import { useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog } from '@/components/ui/dialog';
import { Select } from '@/components/ui/select';

interface AddApiKeyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (provider: string, apiKey: string) => Promise<{ ok: boolean; error?: string }>;
  /** Called after successful save — lets the caller retry the blocked AI call. */
  onSuccess?: () => void;
}

export function AddApiKeyDialog({ open, onOpenChange, onSave, onSuccess }: AddApiKeyDialogProps) {
  const t = useTranslations('ai.keys');
  const tCommon = useTranslations('common');
  const [provider, setProvider] = useState<'openai' | 'anthropic' | 'google'>('openai');
  const [apiKey, setApiKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(async () => {
    if (!apiKey) return;
    setSaving(true);
    setError(null);

    const res = await onSave(provider, apiKey);
    if (res.ok) {
      setApiKey('');
      onOpenChange(false);
      onSuccess?.();
    } else {
      setError(res.error ?? t('error.unexpected'));
    }
    setSaving(false);
  }, [apiKey, provider, onSave, onOpenChange, onSuccess, t]);

  const providers = [
    { value: 'openai', label: t('provider.openai') },
    { value: 'anthropic', label: t('provider.anthropic') },
    { value: 'google', label: t('provider.google') },
  ];

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('addDialog.title')}
      description={t('addDialog.description')}
      closeLabel={tCommon('close')}
    >
      <div className="space-y-4">
        <Select
          label={t('addDialog.provider.label')}
          placeholder={t('selectProvider')}
          options={providers}
          value={provider}
          onValueChange={(v: string) => setProvider(v as 'openai' | 'anthropic' | 'google')}
          disabled={saving}
          emptyLabel={t('selectProvider')}
        />

        <Input
          label={t('addDialog.key.label')}
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder={t('keyPlaceholder')}
          autoComplete="off"
        />

        {error && (
          <p className="text-ui-sm text-danger" role="alert">
            {error}
          </p>
        )}
      </div>
      <div slot="footer" className="flex justify-end gap-2 pt-2">
        <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={saving}>
          {tCommon('cancel')}
        </Button>
        <Button onClick={handleSubmit} disabled={saving || !apiKey}>
          {saving ? t('saving') : t('save')}
        </Button>
      </div>
    </Dialog>
  );
}