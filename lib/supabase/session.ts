import type { User } from '@supabase/supabase-js';
import { createSupabaseServerClient } from './server';

/**
 * The signed-in user, or null.
 *
 * Always `getUser()`, never `getSession()`. `getSession()` reads the cookie and
 * trusts it; `getUser()` verifies the JWT with the auth server. On the server,
 * where the answer decides whether to render someone's data, that difference is
 * the whole security boundary.
 */
export async function getSessionUser(): Promise<User | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return data.user;
}
