import { createClient } from '@supabase/supabase-js';
import { execFileSync } from 'node:child_process';
import type { BrowserContext, Page } from '@playwright/test';

/*
 * Session fixtures for the auth flows.
 *
 * Google OAuth cannot be driven by an automated browser — Google actively
 * blocks automation, and a test that tries is a flake generator that eventually
 * gets marked skip. So these tests create a user through the local admin API
 * and install a real session, which exercises everything we actually wrote:
 * the profile branch in the callback, the route guards, the redirects, and
 * sign-out.
 *
 * What this does NOT prove is that Google sign-in works. That is verified by
 * hand once against the hosted project and reported as a manual check, rather
 * than implied by a green suite.
 */

let cachedEnv: Record<string, string> | null = null;

function localEnv(): Record<string, string> {
  if (cachedEnv) return cachedEnv;

  const fromProcess = {
    API_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
    SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
  };

  if (fromProcess.API_URL && fromProcess.SERVICE_ROLE_KEY) {
    cachedEnv = fromProcess;
    return cachedEnv;
  }

  const raw = execFileSync('pnpm', ['exec', 'supabase', 'status', '-o', 'env'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });

  cachedEnv = Object.fromEntries(
    raw
      .split('\n')
      .map((line) => line.match(/^([A-Z0-9_]+)="(.*)"$/))
      .filter((match): match is RegExpMatchArray => match !== null)
      .map((match) => [match[1] as string, match[2] as string])
  );
  return cachedEnv;
}

function adminClient() {
  const env = localEnv();
  return createClient(env.API_URL!, env.SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export type SeededUser = {
  id: string;
  email: string;
  password: string;
  cleanup: () => Promise<void>;
};

/** Create an auth user with no profile row — the first-run state. */
export async function seedUserWithoutProfile(label: string): Promise<SeededUser> {
  const admin = adminClient();
  const email = `e2e-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;
  const password = 'test-password-not-a-secret';

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: 'José Martínez-Peña' },
  });
  if (error || !data.user) throw new Error(`seed failed: ${error?.message}`);

  return {
    id: data.user.id,
    email,
    password,
    cleanup: async () => {
      await adminClient().auth.admin.deleteUser(data.user!.id);
    },
  };
}

/** Create an auth user that is NOT email-confirmed — the unconfirmed-login state. */
export async function seedUserUnconfirmed(label: string): Promise<SeededUser> {
  const admin = adminClient();
  const email = `e2e-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;
  const password = 'test-password-not-a-secret';

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: false,
  });
  if (error || !data.user) throw new Error(`seed failed: ${error?.message}`);

  return {
    id: data.user.id,
    email,
    password,
    cleanup: async () => {
      await adminClient().auth.admin.deleteUser(data.user!.id);
    },
  };
}

/**
 * Delete an auth user by email, for users the UI itself created (the fixture
 * helpers return a cleanup bound to the id they minted; a UI signup gives us
 * only the email we typed). The profiles FK cascades on delete.
 *
 * Bounded to the first 1000 users — the local e2e stack never approaches that.
 */
export async function cleanupUserByEmail(email: string): Promise<void> {
  const admin = adminClient();
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw new Error(`cleanup list failed: ${error.message}`);
  const match = data.users.find((u) => u.email === email);
  if (!match) return;
  const { error: deleteError } = await admin.auth.admin.deleteUser(match.id);
  if (deleteError) throw new Error(`cleanup delete failed: ${deleteError.message}`);
}

/** Create an auth user that already has a profile — the returning-user state. */
export async function seedUserWithProfile(label: string): Promise<SeededUser> {
  const user = await seedUserWithoutProfile(label);
  const admin = adminClient();

  /*
   * Retry on a slug collision, exactly as create_profile() does for real users.
   * Parallel workers all seed "Returning Student" at once, which is what
   * surfaced the original race — the fixture has to be as careful as the app.
   */
  const base = `Returning Student ${Math.random().toString(36).slice(2, 8)}`;
  let inserted = false;

  for (let attempt = 1; attempt <= 5 && !inserted; attempt += 1) {
    const { data: slug, error: slugError } = await admin.rpc('claim_profile_slug', {
      p_base: base,
    });
    if (slugError) throw new Error(slugError.message);

    const { error } = await admin.from('profiles').insert({
      id: user.id,
      slug: slug as string,
      handle: slug as string,
      display_name: 'Returning Student',
    });

    if (!error) inserted = true;
    else if (error.code !== '23505') throw new Error(`profile seed failed: ${error.message}`);
  }

  if (!inserted) throw new Error('profile seed failed after 5 attempts');

  return user;
}

/**
 * Sign in through the app's own test-only route.
 *
 * Going through the app means @supabase/ssr writes the session cookie itself,
 * so it is byte-identical to a real one. Hand-assembling that cookie here would
 * mean depending on an internal format that breaks silently on a version bump —
 * and it would break as "the user is mysteriously logged out", which is a bad
 * afternoon to debug.
 */
export async function signIn(context: BrowserContext, user: SeededUser): Promise<void> {
  const response = await context.request.post('/api/test-auth', {
    data: { email: user.email, password: user.password },
  });

  if (!response.ok()) {
    throw new Error(
      `test sign-in failed (${response.status()}). Is E2E_TEST_AUTH=1 set for the web server?`
    );
  }
}

/** Assert the page never scrolls sideways. AC 6, and the 390px failure mode. */
export async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    return { scrollWidth: doc.scrollWidth, clientWidth: doc.clientWidth };
  });
  if (overflow.scrollWidth > overflow.clientWidth) {
    throw new Error(
      `horizontal scroll: scrollWidth ${overflow.scrollWidth} > clientWidth ${overflow.clientWidth}`
    );
  }
}
