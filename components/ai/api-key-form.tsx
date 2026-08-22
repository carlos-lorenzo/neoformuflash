'use client';

import { useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { AddApiKeyDialog } from './add-api-key-dialog';
import type { StoredKey } from '@/lib/db/ai-keys';
import { cn } from '@/lib/cn';
import type { Result } from '@/lib/result';

interface ApiKeyFormProps {
  existingKeys: StoredKey[];
  onSave: (provider: string, apiKey: string) => Promise<Result<{ savedAt: string; usage?: { used?: number; limit?: number; remaining?: number; resetAt?: string } }>>;
  onDelete: (provider: string) => Promise<Result<void>>;
  onRefresh?: (provider: string) => Promise<Result<{ usage?: { used?: number; limit?: number; remaining?: number; resetAt?: string } }>>;
  isPro: boolean;
}

export function ApiKeyForm({ existingKeys: initialKeys, onSave, onDelete, onRefresh, isPro }: ApiKeyFormProps) {
  const t = useTranslations('ai.keys');
  const tCommon = useTranslations('common');
  const [keys, setKeys] = useState<StoredKey[]>(initialKeys);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);

  const providers: Array<{ value: 'openai' | 'anthropic' | 'google'; label: string }> = [
    { value: 'openai', label: t('provider.openai') },
    { value: 'anthropic', label: t('provider.anthropic') },
    { value: 'google', label: t('provider.google') },
  ];

  const existingKeyMap = new Map(keys.map(k => [k.provider, k]));

  const handleAddKey = useCallback(async (provider: string, apiKey: string) => {
    const res = await onSave(provider, apiKey);
    if (!res.ok) {
      return { ok: res.ok, error: res.code };
    }
    // Optimistically update local state with the saved key info
    const newKey: StoredKey = {
      provider: provider as 'openai' | 'anthropic' | 'google',
      lastFour: apiKey.slice(-4),
      createdAt: res.value.savedAt,
      usage: res.value.usage,
      isValid: true,
      validatedAt: res.value.savedAt,
    };
    setKeys(prev => {
      const exists = prev.some(k => k.provider === provider);
      if (exists) {
        return prev.map(k => k.provider === provider ? { ...k, ...newKey } : k);
      }
      return [newKey, ...prev];
    });
    return { ok: res.ok, error: undefined, usage: res.value.usage };
  }, [onSave]);

  const handleRefresh = useCallback(async (provider: string) => {
    if (!onRefresh) return { ok: false, error: 'Refresh not available' };
    const res = await onRefresh(provider);
    if (res.ok && res.value?.usage) {
      setKeys(prev => prev.map(k => k.provider === provider ? { ...k, usage: res.value.usage, isValid: true, validatedAt: new Date().toISOString() } : k));
    }
    const error = res.ok ? undefined : res.code;
    const usage = res.ok ? res.value?.usage : undefined;
    return { ok: res.ok, error, usage };
  }, [onRefresh]);

  const handleDelete = useCallback(async (provider: string) => {
    setDeleting(provider);
    const res = await onDelete(provider);
    if (res.ok) {
      // Optimistically remove from local state
      setKeys(prev => prev.filter(k => k.provider !== provider));
    }
    setDeleting(null);
    setShowDeleteConfirm(null);
  }, [onDelete]);

  return (
    <div className="space-y-6">
      {/* Empty state or key list */}
      {keys.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-tertiary mb-4">{t('empty')}</p>
          <p className="text-ui-sm text-tertiary mb-4">{t('emptyDescription')}</p>
          <Button variant="secondary" size="sm" onClick={() => setShowAddDialog(true)}>
            {t('add')}
          </Button>
        </div>
      ) : (
        <dl className="space-y-3">
          {providers.map(({ value, label }) => {
            const key = existingKeyMap.get(value);
            const isValid = key?.isValid ?? true;
            const usage = key?.usage;
            const hasUsage = usage && (usage.used !== undefined || usage.limit !== undefined);
            const remaining = usage?.remaining ?? (usage?.limit && usage?.used ? usage.limit - usage.used : undefined);
            const usedPercent = usage?.limit && usage?.used ? (usage.used / usage.limit) * 100 : undefined;

            return (
              <div key={value} className="flex items-center justify-between p-3 rounded-lg border border-subtle bg-raised">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <span className="text-ui-base font-medium">{label}</span>
                  {key && (
                    <>
                      <span className="text-ui-sm text-tertiary font-mono px-2 py-1 rounded bg-inset">
                        ••••{key.lastFour}
                      </span>
                      {/* Validation status indicator */}
                      <span className={cn('text-ui-xs px-2 py-1 rounded', isValid ? 'text-success bg-success/10' : 'text-danger bg-danger/10')}>
                        {isValid ? t('status.valid') : t('status.invalid')}
                      </span>
                      {/* Usage/quota display */}
                      {hasUsage && (
                        <div className="flex items-center gap-2 ml-2">
                          <span className="text-ui-xs text-tertiary">
                            {t('usage.label')}
                          </span>
                          <div className="w-[8rem] h-2 bg-inset rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary"
                              style={{ width: `${Math.min(usedPercent ?? 0, 100)}%` }}
                            />
                          </div>
                          <span className="text-ui-xs font-mono text-tertiary">
                            {usage.used !== undefined && usage.limit !== undefined
                              ? `${(usage.used / 1000).toFixed(1)}k / ${(usage.limit / 1000).toFixed(1)}k`
                              : usage.used !== undefined
                                ? `${(usage.used / 1000).toFixed(1)}k`
                                : remaining !== undefined
                                  ? `${(remaining / 1000).toFixed(1)}k remaining`
                                  : t('usage.unknown')}
                          </span>
                        </div>
                      )}
                      {key.validatedAt && (
                        <span className="text-ui-xs text-tertiary">
                          {t('validatedAt', { date: new Date(key.validatedAt).toLocaleDateString() })}
                        </span>
                      )}
                    </>
                  )}
                  {isPro && !key && (
                    <span className="text-ui-xs text-accent">{t('proHint')}</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {!key ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setShowAddDialog(true)}
                    >
                      {t('add')}
                    </Button>
                  ) : (
                    <>
                      {onRefresh && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-primary hover:bg-primary/10"
                          onClick={() => handleRefresh(value)}
                          disabled={deleting === value}
                          title={t('refresh.tooltip')}
                        >
                          ↻
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-danger hover:bg-danger/10"
                        onClick={() => setShowDeleteConfirm(value)}
                        disabled={deleting === value}
                      >
                        {deleting === value ? t('deleting') : t('delete')}
                      </Button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </dl>
      )}

      {/* Add key dialog */}
      <AddApiKeyDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        onSave={handleAddKey}
      />

      {/* Delete confirmation dialog */}
      <Dialog
        open={!!showDeleteConfirm}
        onOpenChange={open => !open && setShowDeleteConfirm(null)}
        title={t('deleteConfirmTitle')}
        description={t('deleteConfirmDescription', { provider: showDeleteConfirm ?? '' })}
        closeLabel={tCommon('close')}
      >
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={() => setShowDeleteConfirm(null)}>
            {tCommon('cancel')}
          </Button>
          <Button
            variant="destructive"
            onClick={() => showDeleteConfirm && handleDelete(showDeleteConfirm)}
            disabled={deleting === showDeleteConfirm}
          >
            {t('delete')}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}