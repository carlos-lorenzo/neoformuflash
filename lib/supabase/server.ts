import { createServerClient } from '@supabase/ssr';
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

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} is not set. Copy the values from \`pnpm exec supabase status\` into .env.local.`
    );
  }
  return value;
}
