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
  };
  error?: string;
}

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
    default:
      return { valid: false, error: `Unknown provider: ${provider}` };
  }
}