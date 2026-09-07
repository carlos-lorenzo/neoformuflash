/*
 * Detecting a GoTrue return leg parked on a public page.
 *
 * GoTrue validates the `redirect_to` it was given against the project's
 * auth redirect allowlist. When the URL is missing from that list — a domain
 * moved without the callback path being re-added, an apex/www mismatch — it
 * does not fail: it silently parks the flow on the Site URL (root) with the
 * return query still attached. The user lands on the landing page with
 * `?code=` in the address bar and no session. The two return legs that arrive
 * like this are:
 *
 *   1. OAuth (Google): `?code=...`
 *   2. Email confirmation: `?token_hash=...&type=signup`
 *
 * The middleware routes either shape on to /auth/callback, where the existing
 * exchange logic runs exactly as if GoTrue had honoured the path. A stale or
 * one-time code simply fails there and ends on /login?error=oauth — never a
 * loop. The `type` value is deliberately not validated here: the callback's
 * verifyOtp rejects values outside its known set, so the guard is not worth
 * duplicating (and drifting) in two files.
 */

/** Does this query string look like a parked GoTrue auth return? */
export function isOAuthReturnQuery(searchParams: URLSearchParams): boolean {
  if (searchParams.has('code')) return true;
  return searchParams.has('token_hash') && searchParams.has('type');
}
