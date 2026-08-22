'use server';

import { getSessionUser } from '@/lib/supabase/session';
import { saveApiKey, deleteApiKey, getApiKeyStatus, listAiJobs } from '@/lib/db/ai-keys';
import { ApiKeyInput } from '@neoformuflash/contracts';
import { err, ok, type Result } from '@/lib/result';
import { validateKey, type KeyValidationResult } from '@/lib/ai/validate-key';

/** Usage/quota snapshot returned to the settings page. */
type KeyUsage = KeyValidationResult['usage'];

/**
 * A key can authenticate and still be unusable (empty wallet, rate limit). The
 * save succeeds in that case — the key is correct, so re-typing it would not
 * help — and `warning` carries the catalog key the UI renders next to it.
 */
type SaveKeyResult = {
  savedAt: string;
  usage?: KeyUsage;
  warning?: string;
};

/** Map a provider validation code onto the message catalog. */
function validationWarningKey(validation: KeyValidationResult): string | undefined {
  switch (validation.errorCode) {
    case 'insufficientBalance':
      return 'ai.keys.warning.insufficientBalance';
    case 'rateLimited':
      return 'ai.keys.warning.rateLimited';
    default:
      return undefined;
  }
}

export async function saveApiKeyAction(
  provider: string,
  apiKey: string
): Promise<Result<SaveKeyResult>> {
  const user = await getSessionUser();
  if (!user) return err('error.unauthorized');

  const parsed = ApiKeyInput.safeParse({ provider, apiKey });
  if (!parsed.success) return err('onboarding.invalidInput');

  // Validate the key with the provider before saving
  const validation = await validateKey(parsed.data.provider, parsed.data.apiKey);
  if (!validation.valid) {
    return err('ai.invalidKey', validation.error);
  }

  const res = await saveApiKey(user.id, parsed.data.provider, parsed.data.apiKey, {
    usage: validation.usage,
    isValid: validation.valid,
  });
  if (!res.ok) return err(res.code, res.cause);

  return ok({
    savedAt: res.value.createdAt,
    usage: validation.usage,
    warning: validationWarningKey(validation),
  });
}

export async function deleteApiKeyAction(provider: string): Promise<Result<void>> {
  const user = await getSessionUser();
  if (!user) return err('error.unauthorized');

  const res = await deleteApiKey(user.id, provider as 'openai' | 'anthropic' | 'google' | 'deepseek');
  return res;
}

export async function refreshApiKeyAction(
  provider: string
): Promise<Result<{ usage?: KeyUsage; isValid: boolean; warning?: string }>> {
  const user = await getSessionUser();
  if (!user) return err('error.unauthorized');

  // Get the decrypted key to validate
  const { getDecryptedKey } = await import('@/lib/db/ai-keys');
  const keyRes = await getDecryptedKey(user.id, provider as 'openai' | 'anthropic' | 'google' | 'deepseek');
  if (!keyRes.ok) {
    if (keyRes.code === 'ai.noKey') return err('ai.noKey');
    if (keyRes.code === 'ai.decryptionFailed') return err('ai.decryptionFailed');
    return err('error.unexpected', keyRes.cause);
  }

  const apiKey = keyRes.value;

  // Validate the key with the provider
  const validation = await validateKey(provider as 'openai' | 'anthropic' | 'google' | 'deepseek', apiKey);

  // Update the stored key with new validation info
  const { saveApiKey } = await import('@/lib/db/ai-keys');
  const updateRes = await saveApiKey(user.id, provider as 'openai' | 'anthropic' | 'google' | 'deepseek', apiKey, {
    usage: validation.usage,
    isValid: validation.valid,
  });

  if (!updateRes.ok) return err(updateRes.code, updateRes.cause);

  return ok({
    usage: validation.usage,
    isValid: validation.valid,
    warning: validationWarningKey(validation),
  });
}

export async function getApiKeyStatusAction(): Promise<
  Result<{ hasKeys: Record<'openai' | 'anthropic' | 'google' | 'deepseek', boolean>; isPro: boolean }>
> {
  const user = await getSessionUser();
  if (!user) return err('error.unauthorized');

  const keysRes = await getApiKeyStatus(user.id);
  if (!keysRes.ok) return err(keysRes.code, keysRes.cause);

  const hasKeys: Record<'openai' | 'anthropic' | 'google' | 'deepseek', boolean> = {
    openai: false,
    anthropic: false,
    google: false,
    deepseek: false,
  };

  for (const k of keysRes.value) {
    hasKeys[k.provider as 'openai' | 'anthropic' | 'google' | 'deepseek'] = true;
  }

  // Check pro status for the phase-06 pooled-key hint
  const { createSupabaseServerClient } = await import('@/lib/supabase/server');
  const supabase = await createSupabaseServerClient();
  const { data: profile } = await supabase
    .from('profiles')
    .select('is_pro')
    .eq('id', user.id)
    .maybeSingle();

  return ok({
    hasKeys,
    isPro: profile?.is_pro ?? false,
  });
}

export async function listAiJobsAction(limit: number = 20): Promise<Result<{
  id: string;
  kind: string;
  status: string;
  inputTokens: number | null;
  outputTokens: number | null;
  error: string | null;
  createdAt: string;
}[]>> {
  const user = await getSessionUser();
  if (!user) return err('error.unauthorized');

  const res = await listAiJobs(user.id, limit);
  if (!res.ok) return err(res.code, res.cause);

  return ok(res.value);
}