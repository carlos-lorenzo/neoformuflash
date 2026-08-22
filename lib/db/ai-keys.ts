/**
 * AI keys and jobs data access — all via service_role.
 *
 * The authenticated role has NO select on ciphertext/iv (phase 01 grant).
 * Only this module (and the AI route handlers that import it) use service_role.
 */

import type { AiProvider } from '@neoformuflash/contracts';
import { err, ok, type Result } from '@/lib/result';
import { createSupabaseServiceClient } from '@/lib/supabase/server';
import { encryptKey, decryptKey } from '@/lib/ai/crypto';

export type StoredKey = {
  provider: AiProvider;
  lastFour: string;
  createdAt: string;
  // Usage/quota info from provider validation
  usage?: {
    used?: number;
    limit?: number;
    remaining?: number;
    resetAt?: string;
  };
  // Validation status
  validatedAt?: string;
  isValid?: boolean;
};

export type AiJob = {
  id: string;
  userId: string;
  kind: string; // 'pdf_to_note' | 'copilot' | 'notes_to_cards'
  status: 'pending' | 'running' | 'done' | 'error';
  inputTokens: number | null;
  outputTokens: number | null;
  error: string | null;
  createdAt: string;
};

/** Encrypt and store a BYOK key for the user. Upsert on (user_id, provider). */
export async function saveApiKey(
  userId: string,
  provider: AiProvider,
  plaintextKey: string,
  options?: {
    usage?: StoredKey['usage'];
    isValid?: boolean;
  }
): Promise<Result<StoredKey>> {
  const supabase = await createSupabaseServiceClient();

  const { ciphertext, iv, lastFour } = encryptKey(plaintextKey);

  const now = new Date().toISOString();

  // Postgres bytea columns expect binary data. When inserting via Supabase/PostgREST,
  // we must use the Postgres hex format with \\x prefix. If we pass raw hex strings,
  // Postgres stores the ASCII bytes of the hex string, causing double-encoding on read.
  const ciphertextPg = '\\x' + ciphertext;
  const ivPg = '\\x' + iv;

  const upsertData = {
    user_id: userId,
    provider,
    ciphertext: ciphertextPg,
    iv: ivPg,
    last_four: lastFour,
    ...(options?.usage !== undefined ? { usage: options.usage } : {}),
    ...(options?.isValid !== undefined ? { validated_at: now, is_valid: options.isValid } : {}),
  };

  const { data, error } = await supabase
    .from('user_api_keys')
    .upsert(upsertData, { onConflict: 'user_id,provider' })
    .select('provider, last_four, created_at, usage, validated_at, is_valid')
    .single();

  if (error) return err('error.unexpected', error);

  // Supabase JSONB columns return unknown; cast to our usage type
  const usage = data.usage as StoredKey['usage'] | undefined;

  return ok({
    provider: data.provider,
    lastFour: data.last_four,
    createdAt: data.created_at,
    usage: usage ?? options?.usage,
    validatedAt: data.validated_at ?? (options?.usage !== undefined ? now : undefined),
    isValid: data.is_valid ?? options?.isValid,
  });
}

/** Delete a user's key for a provider. */
export async function deleteApiKey(userId: string, provider: AiProvider): Promise<Result<void>> {
  const supabase = await createSupabaseServiceClient();

  const { error } = await supabase
    .from('user_api_keys')
    .delete()
    .eq('user_id', userId)
    .eq('provider', provider);

  if (error) return err('error.unexpected', error);
  return ok(undefined);
}

/** Get all stored keys for a user (last_four only — never ciphertext/iv). */
export async function getApiKeyStatus(userId: string): Promise<Result<StoredKey[]>> {
  const supabase = await createSupabaseServiceClient();

  const { data, error } = await supabase
    .from('user_api_keys')
    .select('provider, last_four, created_at, usage, validated_at, is_valid')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) return err('error.unexpected', error);

  return ok(
    (data ?? []).map((d) => ({
      provider: d.provider,
      lastFour: d.last_four,
      createdAt: d.created_at,
      usage: (d.usage as StoredKey['usage'] | undefined) ?? undefined,
      validatedAt: d.validated_at ?? undefined,
      isValid: d.is_valid ?? undefined,
    })),
  );
}

/** Decrypt a user's key for a provider. Returns the plaintext key. */
export async function getDecryptedKey(userId: string, provider: AiProvider): Promise<Result<string>> {
  const supabase = await createSupabaseServiceClient();

  const { data, error } = await supabase
    .from('user_api_keys')
    .select('ciphertext, iv')
    .eq('user_id', userId)
    .eq('provider', provider)
    .maybeSingle();

  if (error) return err('error.unexpected', error);
  if (!data) return err('ai.noKey');

  // Postgres bytea output format includes \\x prefix; strip it before decoding hex
  const ciphertextHex = data.ciphertext.startsWith('\\x') ? data.ciphertext.slice(2) : data.ciphertext;
  const ivHex = data.iv.startsWith('\\x') ? data.iv.slice(2) : data.iv;

  try {
    const plaintext = decryptKey(ciphertextHex, ivHex);
    return ok(plaintext);
  } catch {
    return err('ai.decryptionFailed');
  }
}

/** Insert an ai_jobs row for audit. */
export async function insertAiJob(
  userId: string,
  kind: string, // 'pdf_to_note' | 'copilot' | 'notes_to_cards'
  status: 'pending' | 'running' | 'done' | 'error',
  inputTokens: number | null = null,
  outputTokens: number | null = null,
  error: string | null = null
): Promise<Result<AiJob>> {
  const supabase = await createSupabaseServiceClient();

  const { data, error: insertError } = await supabase
    .from('ai_jobs')
    .insert({
      user_id: userId,
      kind,
      status,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      error,
    })
    .select()
    .single();

  if (insertError) return err('error.unexpected', insertError);

  return ok({
    id: data.id,
    userId: data.user_id,
    kind: data.kind,
    status: data.status as 'pending' | 'running' | 'done' | 'error',
    inputTokens: data.input_tokens,
    outputTokens: data.output_tokens,
    error: data.error,
    createdAt: data.created_at,
  });
}

/** Update an ai_jobs row (status, tokens, error). */
export async function updateAiJob(
  jobId: string,
  updates: Partial<{
    status: 'pending' | 'running' | 'done' | 'error';
    inputTokens: number;
    outputTokens: number;
    error: string;
  }>
): Promise<Result<void>> {
  const supabase = await createSupabaseServiceClient();

  const { error } = await supabase
    .from('ai_jobs')
    .update({
      status: updates.status,
      input_tokens: updates.inputTokens,
      output_tokens: updates.outputTokens,
      error: updates.error,
    })
    .eq('id', jobId);

  if (error) return err('error.unexpected', error);
  return ok(undefined);
}

/** List recent AI jobs for a user (key settings page). */
export async function listAiJobs(userId: string, limit: number = 20): Promise<Result<AiJob[]>> {
  const supabase = await createSupabaseServiceClient();

  const { data, error } = await supabase
    .from('ai_jobs')
    .select('id, user_id, kind, status, input_tokens, output_tokens, error, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) return err('error.unexpected', error);

  return ok(
    (data ?? []).map((d) => ({
      id: d.id,
      userId: d.user_id,
      kind: d.kind,
      status: d.status as 'pending' | 'running' | 'done' | 'error',
      inputTokens: d.input_tokens,
      outputTokens: d.output_tokens,
      error: d.error,
      createdAt: d.created_at,
    })),
  );
}