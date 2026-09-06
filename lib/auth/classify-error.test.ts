import { describe, expect, it } from 'vitest';
import type { AuthError } from '@supabase/supabase-js';
import { classifyAuthError, isUnexpectedFailure } from './classify-error';

/*
 * The sign-in and sign-up actions used to switch on the raw error code and fall
 * back to "Something went wrong." for anything they did not know. That fallback
 * is what made the hosted email/password failures a dead end: a bare 429 (no
 * code) and a connection failure both landed on the generic copy, and nothing
 * logged the real error. These tests pin the classification so a code the
 * hosted project adds cannot silently turn into a dead end again.
 */

function authError(partial: Partial<AuthError>): AuthError {
  return {
    name: 'AuthApiError',
    message: partial.message ?? 'msg',
    status: partial.status ?? 400,
    code: partial.code ?? undefined,
    ...partial,
  } as AuthError;
}

describe('classifyAuthError', () => {
  it('maps the shared GoTrue credentials code', () => {
    expect(classifyAuthError(authError({ code: 'invalid_credentials' }))).toBe('invalid');
  });

  it('maps the unconfirmed-email code', () => {
    expect(classifyAuthError(authError({ code: 'email_not_confirmed' }))).toBe('unconfirmed');
  });

  it('maps both rate-limit codes', () => {
    expect(classifyAuthError(authError({ code: 'over_request_rate_limit' }))).toBe('rateLimited');
    expect(classifyAuthError(authError({ code: 'over_email_send_rate_limit' }))).toBe('rateLimited');
  });

  it('maps signup codes', () => {
    expect(classifyAuthError(authError({ code: 'user_already_exists' }))).toBe('emailTaken');
    expect(classifyAuthError(authError({ code: 'weak_password' }))).toBe('weakPassword');
    expect(classifyAuthError(authError({ code: 'validation_failed' }))).toBe('invalidEmail');
    expect(classifyAuthError(authError({ code: 'email_address_invalid' }))).toBe('invalidEmail');
  });

  it('treats a bare 429 (no code) as rate-limited — the hosted shape that used to hit "Something went wrong"', () => {
    expect(classifyAuthError(authError({ status: 429 }))).toBe('rateLimited');
  });

  it('treats a connection failure as network, even with no status or code', () => {
    expect(
      classifyAuthError(authError({ name: 'AuthRetryableFetchError', status: undefined }))
    ).toBe('network');
  });

  it('leaves an unknown code as unexpected', () => {
    expect(classifyAuthError(authError({ code: 'a_code_supabase_added_later' }))).toBe('unexpected');
  });
});

describe('isUnexpectedFailure', () => {
  it('flags only the two failures that should reach the server log', () => {
    expect(isUnexpectedFailure('unexpected')).toBe(true);
    expect(isUnexpectedFailure('network')).toBe(true);
    expect(isUnexpectedFailure('invalid')).toBe(false);
    expect(isUnexpectedFailure('unconfirmed')).toBe(false);
    expect(isUnexpectedFailure('rateLimited')).toBe(false);
    expect(isUnexpectedFailure('emailTaken')).toBe(false);
  });
});
