import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import type { Database } from '@neoformuflash/contracts/db';

/*
 * The server-side Supabase client, scoped to the current request's cookies.
 *
 * This uses the ANON key and therefore runs under RLS as the signed-in user.
 * The service-role key appears in exactly two places in this codebase — database
 * migrations and (later) the Stripe webhook. Anywhere else is a blocking
 * security finding per specs/01-contracts.md.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    {
      cookieOptions: COOKIE_OPTIONS,
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called from a Server Component, where cookies are read-only.
            // The middleware refreshes the session, so this is safe to ignore —
            // it is the documented @supabase/ssr pattern, not a swallowed error.
          }
        },
      },
    }
  );
}

/*
 * A pure anon client that never reads cookies — for public pages that must
 * ignore any signed-in session. This guarantees the same visibility as a
 * logged-out visitor.
 */
export function createSupabaseAnonClient() {
  return createClient<Database>(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    {
      auth: { autoRefreshToken: false, persistSession: false },
    }
  );
}

/*
 * Service-role client for operations that must bypass RLS and column grants.
 *
 * EXTREMELY RESTRICTED: only the AI key storage (lib/db/ai-keys.ts) and the
 * Stripe webhook may import this. Any other import is a blocking security
 * finding per specs/01-contracts.md.
 */
export function createSupabaseServiceClient() {
  return createClient<Database>(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
    {
      auth: { autoRefreshToken: false, persistSession: false },
    }
  );
}

/*
 * @supabase/ssr defaults to `{ sameSite: 'lax', httpOnly: false }` with no
 * `secure` flag at all, so the access AND refresh tokens travel over plain http
 * if the origin is ever reachable that way. `secure` is set here rather than
 * left to the platform, because "Vercel probably adds it at the edge" is an
 * assumption, not a guarantee, and it costs nothing to be certain.
 *
 * `httpOnly: true` protects the refresh token from XSS. The browser client
 * does not read cookies via document.cookie — it relies on the browser's
 * automatic cookie handling via HTTP requests. This is the secure default.
 */
const COOKIE_OPTIONS = {
  secure: process.env.NODE_ENV === 'production',
  httpOnly: true,
  sameSite: 'lax',
} as const;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} is not set. Copy the values from \`pnpm exec supabase status\` into .env.local.`
    );
  }
  return value;
}
