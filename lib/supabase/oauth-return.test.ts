import { describe, expect, it } from 'vitest';
import { isOAuthReturnQuery } from './oauth-return';

/*
 * The middleware rescue routes these shapes on to /auth/callback, so the
 * predicate must match exactly the return legs GoTrue can park on a public
 * page — and nothing else. The bug that motived it (a moved domain whose
 * callback path was missing from the Supabase redirect allowlist) produced a
 * silent `/?code=` landing with no session; these cases fix that, the rest are
 * there to stop ordinary marketing traffic being dragged through auth.
 */

function q(search: string): URLSearchParams {
  return new URLSearchParams(search);
}

describe('isOAuthReturnQuery', () => {
  it('matches the OAuth return leg (Google PKCE)', () => {
    expect(isOAuthReturnQuery(q('code=950da17b-3fd8-498a-9e13-f342c204de2f'))).toBe(true);
  });

  it('matches the email-confirmation return leg', () => {
    expect(isOAuthReturnQuery(q('token_hash=abc123&type=signup'))).toBe(true);
  });

  it('does not match a bare token_hash without a type', () => {
    expect(isOAuthReturnQuery(q('token_hash=abc123'))).toBe(false);
  });

  it('does not match a bare type without a token_hash', () => {
    expect(isOAuthReturnQuery(q('type=signup'))).toBe(false);
  });

  it('does not match an empty or unrelated query', () => {
    expect(isOAuthReturnQuery(q(''))).toBe(false);
    expect(isOAuthReturnQuery(q('utm_source=google&ref=home'))).toBe(false);
    expect(isOAuthReturnQuery(q('error=oauth'))).toBe(false);
  });

  it('ignores unrelated params alongside a return leg', () => {
    expect(isOAuthReturnQuery(q('code=abc&state=xyz&utm_source=google'))).toBe(true);
    expect(isOAuthReturnQuery(q('foo=1&token_hash=abc&type=recovery&bar=2'))).toBe(true);
  });
});
