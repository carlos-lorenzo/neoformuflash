'use client';

import { useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Dialog } from '@/components/ui/dialog';

interface GenerateCardsButtonProps {
  noteId: string;
  courseId?: string | null;
  onSuccess: (deckId: string) => void;
  onRequireKey?: () => void;
}

export function GenerateCardsButton({ noteId, courseId, onSuccess, onRequireKey }: GenerateCardsButtonProps) {
  const t = useTranslations('ai.cards');
  const tCommon = useTranslations('common');
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<'new_deck' | 'existing_deck'>('new_deck');
  const [provider, setProvider] = useState<'openai' | 'anthropic' | 'google' | 'deepseek'>('openai');
  const [deckId, setDeckId] = useState('');
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(async () => {
    setProcessing(true);
    setError(null);

    try {
      const res = await fetch(`/app/notes/${noteId}/ai/generate-cards`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          noteId,
          courseId: target === 'new_deck' ? courseId : null,
          target,
          deckId: target === 'existing_deck' ? deckId : null,
          provider,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        onSuccess(data.deckId);
        setOpen(false);
        return;
      }

      const errorCode = data.error;
      if (errorCode === 'ai.noKey') {
        onRequireKey?.();
        setOpen(false);
        return;
      }

      // Map server error codes (dot notation) to catalog keys (underscore notation)
      const errorKeyMap: Record<string, string> = {
        'ai.noKey': 'ai_noKey',
        'ai.providerError': 'ai_providerError',
        'ai.invalidOutput': 'ai_invalidOutput',
        'ai.emptyNote': 'ai_emptyNote',
        'content.deck.notFound': 'content_deck_notFound',
      };
      const catalogKey = errorKeyMap[errorCode];
      setError(catalogKey ? t(`error.${catalogKey}`) : t('error.unexpected'));
    } catch {
      setError(t('error.unexpected'));
    } finally {
      setProcessing(false);
    }
  }, [noteId, courseId, target, deckId, provider, onSuccess, onRequireKey, t]);

  const providers = [
    { value: 'openai', label: t('provider.openai') },
    { value: 'anthropic', label: t('provider.anthropic') },
    { value: 'google', label: t('provider.google') },
    { value: 'deepseek', label: t('provider.deepseek') },
  ];

  const targets = [
    { value: 'new_deck' as const, label: t('target.newDeck') },
    { value: 'existing_deck' as const, label: t('target.existingDeck') },
  ];

  return (
    <>
      <Button
        variant="primary"
        size="sm"
        onClick={() => setOpen(true)}
        disabled={processing}
      >
        {t('generate')}
      </Button>

      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={t('title')}
        description={t('description')}
        closeLabel={tCommon('close')}
      >
        <div className="space-y-4 py-2">
          <Select
            label={t('target.label')}
            placeholder={t('target.placeholder')}
            options={targets}
            value={target}
            onValueChange={(v: string) => setTarget(v as 'new_deck' | 'existing_deck')}
            disabled={processing}
            emptyLabel={t('target.placeholder')}
          />

          {target === 'existing_deck' && (
            <Input
              label={t('deckId.label')}
              placeholder={t('deckId.placeholder')}
              value={deckId}
              onChange={e => setDeckId(e.target.value)}
              disabled={processing}
            />
          )}

          <Select
            label={t('provider.label')}
            placeholder={t('provider.placeholder')}
            options={providers}
            value={provider}
            onValueChange={(v: string) => setProvider(v as 'openai' | 'anthropic' | 'google' | 'deepseek')}
            disabled={processing}
            emptyLabel={t('provider.placeholder')}
          />

          {error && (
            <p className="text-ui-sm text-danger" role="alert">
              {error}
            </p>
          )}
        </div>
        <div slot="footer" className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={() => setOpen(false)} disabled={processing}>
            {tCommon('cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={processing || (target === 'existing_deck' && !deckId)}>
            {processing ? t('processing') : t('generate')}
          </Button>
        </div>
      </Dialog>
    </>
  );
}