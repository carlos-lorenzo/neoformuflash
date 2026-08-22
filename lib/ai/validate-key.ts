/**
 * Provider API key validation.
 *
 * Validates BYOK keys against the respective provider APIs before saving.
 * Returns validation result with optional usage/quota information.
 */

import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';
import type { AiProvider } from '@neoformuflash/contracts';

export interface KeyValidationResult {
  valid: boolean;
  usage?: {
    used?: number;
    limit?: number;
    remaining?: number;
    resetAt?: string;
    /** Provider currency for balance-style quotas (DeepSeek returns CNY/USD). */
    currency?: string;
    /** Provider says the account has enough balance to serve requests. */
    isAvailable?: boolean;
  };
  /** Stable code the UI maps to a translated message. */
  errorCode?: KeyValidationErrorCode;
  error?: string;
}

/**
 * Stable validation outcomes. The UI translates these; `error` stays as the raw
 * provider text for the settings page's diagnostic line.
 */
export type KeyValidationErrorCode =
  | 'invalidKey'
  | 'insufficientBalance'
  | 'rateLimited'
  | 'providerUnreachable'
  | 'unknown';

/**
 * Validate an OpenAI API key by listing models.
 * If successful, attempts to fetch usage from the billing endpoint.
 */
export async function validateOpenAIKey(apiKey: string): Promise<KeyValidationResult> {
  try {
    const client = new OpenAI({ apiKey });

    // Test the key with a minimal request (list models is lightweight)
    await client.models.list();

    // Try to fetch usage info from the billing endpoint
    // Note: This requires the key to have billing permissions
    let usage: KeyValidationResult['usage'] = undefined;
    try {
      const response = await fetch('https://api.openai.com/v1/dashboard/billing/usage', {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        // OpenAI returns total_usage in cents, but we want token estimates
        // The billing endpoint doesn't give token counts directly
        // We'll return what we can
        usage = {
          used: data.total_usage ?? undefined,
          limit: undefined, // OpenAI doesn't expose a hard limit via API
          remaining: undefined,
          resetAt: undefined,
        };
      }
    } catch {
      // Usage fetch failed - key is still valid, just no usage info
    }

    return { valid: true, usage };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    // Check for specific error types
    if (message.includes('401') || message.includes('invalid_api_key') || message.includes('Incorrect API key')) {
      return { valid: false, error: 'Invalid API key' };
    }
    if (message.includes('429') || message.includes('rate_limit')) {
      return { valid: true, error: 'Rate limited - key may be valid but rate limited' };
    }
    return { valid: false, error: `OpenAI validation failed: ${message}` };
  }
}

/**
 * Validate an Anthropic API key by making a minimal completion request.
 */
export async function validateAnthropicKey(apiKey: string): Promise<KeyValidationResult> {
  try {
    const client = new Anthropic({ apiKey });

    // Test the key with a minimal completion request
    await client.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 1,
      messages: [{ role: 'user', content: 'Hi' }],
    });

    // Anthropic doesn't have a public usage API yet
    // We can only confirm the key is valid

    return { valid: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    if (message.includes('401') || message.includes('invalid_api_key') || message.includes('authentication_error')) {
      return { valid: false, error: 'Invalid API key' };
    }
    if (message.includes('429') || message.includes('rate_limit')) {
      return { valid: true, error: 'Rate limited - key may be valid but rate limited' };
    }
    return { valid: false, error: `Anthropic validation failed: ${message}` };
  }
}

/**
 * Validate a Google (Gemini) API key by listing models.
 */
export async function validateGoogleKey(apiKey: string): Promise<KeyValidationResult> {
  try {
    const genAI = new GoogleGenerativeAI(apiKey);

    // Test the key by listing models
    const model = genAI.getGenerativeModel({ model: 'gemini-3.6-flash' });
    await model.countTokens('test');

    // Google AI Studio doesn't expose usage/quota via API for BYOK
    // Only Vertex AI has quota APIs

    return { valid: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    if (message.includes('401') || message.includes('invalid_api_key') || message.includes('API_KEY_INVALID')) {
      return { valid: false, error: 'Invalid API key' };
    }
    if (message.includes('429') || message.includes('QUOTA_EXCEEDED') || message.includes('rate_limit')) {
      return { valid: true, error: 'Rate limited - key may be valid but rate limited' };
    }
    return { valid: false, error: `Google validation failed: ${message}` };
  }
}

/**
 * Validate a DeepSeek API key against GET /user/balance.
 *
 * This is the cheapest check available and the only one that reports quota:
 * it costs no tokens, distinguishes "bad key" (401) from "valid key, empty
 * wallet" (is_available === false), and returns the balance we surface in the
 * settings page. A completion request could only tell us the first of those,
 * and it would burn credit on an account we already suspect is empty.
 */
export async function validateDeepSeekKey(apiKey: string): Promise<KeyValidationResult> {
  let response: Response;
  try {
    response = await fetch('https://api.deepseek.com/user/balance', {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { valid: false, errorCode: 'providerUnreachable', error: message };
  }

  if (response.status === 401 || response.status === 403) {
    return { valid: false, errorCode: 'invalidKey', error: 'Invalid API key' };
  }
  if (response.status === 429) {
    return { valid: true, errorCode: 'rateLimited', error: 'Rate limited' };
  }
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    return {
      valid: false,
      errorCode: 'unknown',
      error: `DeepSeek validation failed (${response.status}): ${body.slice(0, 200)}`,
    };
  }

  const data = (await response.json().catch(() => null)) as {
    is_available?: boolean;
    balance_infos?: Array<{
      currency?: string;
      total_balance?: string;
      granted_balance?: string;
      topped_up_balance?: string;
    }>;
  } | null;

  if (!data) {
    return { valid: false, errorCode: 'unknown', error: 'DeepSeek returned an unreadable balance response' };
  }

  // balance_infos is one entry per currency. The first is the account's
  // settlement currency, which is what the dashboard bills against.
  const info = data.balance_infos?.[0];
  const remaining = info?.total_balance !== undefined ? Number(info.total_balance) : undefined;

  const usage: KeyValidationResult['usage'] = {
    remaining: Number.isFinite(remaining) ? remaining : undefined,
    currency: info?.currency,
    isAvailable: data.is_available,
  };

  // The key authenticated, so it is valid and worth storing — but with an empty
  // wallet every generation will fail, so the settings page needs to say so.
  if (data.is_available === false) {
    return { valid: true, usage, errorCode: 'insufficientBalance', error: 'Insufficient balance' };
  }

  return { valid: true, usage };
}

/**
 * Validate an API key for the given provider.
 */
export async function validateKey(provider: AiProvider, apiKey: string): Promise<KeyValidationResult> {
  switch (provider) {
    case 'openai':
      return validateOpenAIKey(apiKey);
    case 'anthropic':
      return validateAnthropicKey(apiKey);
    case 'google':
      return validateGoogleKey(apiKey);
    case 'deepseek':
      return validateDeepSeekKey(apiKey);
    default:
      return { valid: false, error: `Unknown provider: ${provider}` };
  }
}