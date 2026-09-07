import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { isOAuthReturnQuery } from './oauth-return';

/*
 * Refresh the Supabase session on every request and guard the authed routes.
 *
 * Two rules that are easy to get subtly wrong and expensive to debug:
 *
 * 1. The response object must be the one whose cookies the client wrote to.
 *    Constructing a fresh NextResponse after `getUser()` silently drops the
 *    refreshed tokens, and the user gets signed out roughly every hour.
 * 2. `getUser()`, never `getSession()`. getSession trusts the cookie; getUser
 *    verifies the JWT with the auth server. This decides whether someone sees
 *    another student's dashboard.
 */

/*
 * /app/* requires authentication. /onboarding is authed too — a signed-in user
 * on /onboarding is mid-flow; a signed-out user is redirected to /login by the
 * guard below.
 *
 * Review lived at /review/* until phase 03c moved it to
 * /app/courses/[id]/review/[deckId], which the /app prefix already covers. The
 * review layout asserts getSessionUser() as a second line of defence, but the
 * middleware is the primary gate — without it, the session is reachable
 * unauthenticated at the edge.
 */
const AUTHED_PREFIXES = ['/app', '/onboarding'];

export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });

  const { pathname, searchParams } = request.nextUrl;

  /*
   * Rescue parked auth returns. GoTrue lands an OAuth/email-return query on the
   * Site URL root when the exact callback URL is missing from the project's
   * redirect allowlist — see lib/supabase/oauth-return.ts. Route it on to
   * /auth/callback so the normal exchange runs instead of leaving the user on
   * the landing page with `?code=` and no session. Scoped to GETs on public /
   * auth pages: a real /auth/callback hit is the destination, not a rescue, and
   * authed surfaces never legitimately carry a fresh return query.
   */
  const isPublicPath =
    pathname !== '/auth/callback' &&
    !AUTHED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));

  if (request.method === 'GET' && isPublicPath && isOAuthReturnQuery(searchParams)) {
    const callbackUrl = request.nextUrl.clone();
    callbackUrl.pathname = '/auth/callback';
    return NextResponse.redirect(callbackUrl);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are missing. ' +
        'Create .env.local with the values from `pnpm exec supabase status`, then restart the server.'
    );
  }

  const supabase = createServerClient(url, anonKey, {
    // Must match lib/supabase/server.ts — the middleware is what actually
    // rewrites the refreshed session cookie, so omitting `secure` here would
    // undo it on the very request that matters.
    cookieOptions: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      sameSite: 'lax',
    },
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const needsAuth = AUTHED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );

  if (needsAuth && !user) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = '/login';
    redirectUrl.search = '';
    return NextResponse.redirect(redirectUrl);
  }

  // A signed-in user has no reason to see the sign-in or sign-up page.
  if ((pathname === '/login' || pathname === '/signup') && user) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = '/app';
    return NextResponse.redirect(redirectUrl);
  }

  return response;
}
