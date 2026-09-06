import type { AuthError } from '@supabase/supabase-js';

/**
 * Classify a GoTrue error into a stable semantic failure shared by the sign-in
 * and sign-up actions, so their catalog-key mapping lives next to each action
 * and this file stays a pure switch that is trivial to unit-test.
 *
 * The values are NOT message keys — each screen maps a failure to its own
 * catalogue namespace (login.* vs signup.*) with the same copy for the shared
 * cases (rate limit, "something went wrong").
 */

export type AuthFailure =
  /** Wrong email/password — or a Google-only account, which has no password. */
  | 'invalid'
  /** The auth user exists but the email was never confirmed (confirmations on). */
  | 'unconfirmed'
  | 'emailTaken'
  | 'weakPassword'
  | 'invalidEmail'
  /** GoTrue 429s — with the coded variants or as a bare 429 with no code. */
  | 'rateLimited'
  /** GoTrue unreachable (fetch/DNS/connection failure). */
  | 'network'
  /** Anything unclassified — the action logs the raw error so a new code is never a dead end. */
  | 'unexpected';

export function classifyAuthError(error: AuthError): AuthFailure {
  // supabase-js surfaces connection failures as AuthRetryableFetchError, before
  // any HTTP round trip — there is no status or code to read.
  if (error.name === 'AuthRetryableFetchError') return 'network';

  // Hosted rate limits sometimes arrive as a bare 429 with no code. Treat any
  // 429 as rate-limited regardless of whether the coded variants below matched.
  if (error.status === 429) return 'rateLimited';

  switch (error.code) {
    case 'invalid_credentials':
      return 'invalid';
    case 'email_not_confirmed':
      return 'unconfirmed';
    case 'over_request_rate_limit':
    case 'over_email_send_rate_limit':
      return 'rateLimited';
    case 'user_already_exists':
      return 'emailTaken';
    case 'weak_password':
      return 'weakPassword';
    case 'validation_failed':
    case 'email_address_invalid':
      return 'invalidEmail';
    default:
      return 'unexpected';
  }
}

/**
 * Only failures we could not map are worth a server log line. A wrong password
 * or a duplicate signup is normal traffic and would drown the log; an unknown
 * code or an unreachable auth server is exactly what needs to reach it.
 */
export function isUnexpectedFailure(failure: AuthFailure): boolean {
  return failure === 'unexpected' || failure === 'network';
}
