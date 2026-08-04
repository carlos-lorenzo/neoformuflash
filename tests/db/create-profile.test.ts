import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, describe, expect, it } from 'vitest';

/*
 * Concurrency test for create_profile().
 *
 * The first version of this schema returned a free slug and let the caller
 * insert it separately. Two parallel Playwright workers hit the window between
 * those two steps on the very first full run, and the loser got a duplicate-key
 * error at the last step of onboarding.
 *
 * That is the worst shape of bug this project can ship: it only appears under
 * load, it only affects new users, and it only affects the one action they
 * cannot retry their way out of. So it gets an explicit test.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const createdUserIds: string[] = [];

async function signedInClient(label: string): Promise<SupabaseClient> {
  const email = `cp-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;
  const password = 'test-password-not-a-secret';

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(error?.message);
  createdUserIds.push(data.user.id);

  const client = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const signIn = await client.auth.signInWithPassword({ email, password });
  if (signIn.error) throw new Error(signIn.error.message);

  return client;
}

afterAll(async () => {
  for (const id of createdUserIds) await admin.auth.admin.deleteUser(id);
});

describe('create_profile', () => {
  it('gives ten simultaneous signups with the same name ten distinct slugs', async () => {
    const sharedName = `Race Test ${Date.now()}`;
    const clients = await Promise.all(
      Array.from({ length: 10 }, (_, index) => signedInClient(`race${index}`))
    );

    // All ten fire at once. Serialising them would test nothing.
    const results = await Promise.all(
      clients.map((client) =>
        client.rpc('create_profile', {
          p_display_name: sharedName,
          p_avatar_url: null,
          p_locale: 'en',
          p_institution_id: null,
          p_degree_id: null,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- generated Args omit Postgres parameter nullability
        } as any)
      )
    );

    const failures = results.filter((result) => result.error);
    expect(failures.map((f) => f.error?.message)).toEqual([]);

    const slugs = results.map((result) => (result.data as { slug: string }).slug);
    expect(new Set(slugs).size).toBe(10);
    for (const slug of slugs) {
      expect(slug).toMatch(/^[a-z0-9][a-z0-9_-]{2,29}$/);
    }
  }, 30_000);

  it('refuses a second profile for the same user', async () => {
    const client = await signedInClient('double');

    const first = await client.rpc('create_profile', {
      p_display_name: 'First Profile',
      p_avatar_url: null,
      p_locale: 'en',
      p_institution_id: null,
      p_degree_id: null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- generated Args omit Postgres parameter nullability
    } as any);
    expect(first.error).toBeNull();

    const second = await client.rpc('create_profile', {
      p_display_name: 'Second Profile',
      p_avatar_url: null,
      p_locale: 'en',
      p_institution_id: null,
      p_degree_id: null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- generated Args omit Postgres parameter nullability
    } as any);
    // Must fail fast rather than spin the retry loop on the primary key.
    expect(second.error?.message).toContain('profile already exists');
  }, 20_000);

  it('takes the user id from auth.uid(), so it cannot be forged', async () => {
    const client = await signedInClient('forge');

    const { data } = await client.rpc('create_profile', {
      p_display_name: 'Forge Test',
      p_avatar_url: null,
      p_locale: 'en',
      p_institution_id: null,
      p_degree_id: null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- generated Args omit Postgres parameter nullability
    } as any);

    const { data: session } = await client.auth.getUser();
    expect((data as { id: string }).id).toBe(session.user?.id);
  }, 20_000);

  it('is refused entirely when anonymous', async () => {
    const anon = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { error } = await anon.rpc('create_profile', {
      p_display_name: 'Anonymous',
      p_avatar_url: null,
      p_locale: 'en',
      p_institution_id: null,
      p_degree_id: null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- generated Args omit Postgres parameter nullability
    } as any);

    expect(error).not.toBeNull();
  });
});
