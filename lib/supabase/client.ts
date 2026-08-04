'use client';

import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@neoformuflash/contracts/db';

/*
 * Browser client. Used for exactly one thing in phase 00: starting the Google
 * OAuth redirect, which has to originate from the browser so Supabase can store
 * the PKCE verifier.
 *
 * Everything else goes through lib/db/* on the server. Per CLAUDE.md there are
 * no Supabase calls inside components.
 */
export function createSupabaseBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    // Supabase's own message here points at a dashboard URL, which is the wrong
    // advice for a local stack and sends people looking in the wrong place.
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are missing. ' +
        'Create .env.local with the values from `pnpm exec supabase status`, then restart the dev server.'
    );
  }

  return createBrowserClient<Database>(url, key);
}
