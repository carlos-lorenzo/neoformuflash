import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/*
 * RLS suite for the phase 00 tables.
 *
 * These go through PostgREST with a real signed-in session rather than through
 * psql, because that is the surface the app actually talks to and it exercises
 * grants and policies together. A psql test connects as `postgres`, which is a
 * superuser with BYPASSRLS — it will report PASS forever while proving nothing.
 * (That is not hypothetical; the first version of this check did exactly that.)
 *
 * Phase 01 extends this file as it adds tables. Every table gets RLS; a new
 * table without a policy is a bug.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

type TestUser = { id: string; email: string; client: SupabaseClient };

async function createUser(label: string): Promise<TestUser> {
  const email = `rls-${label}-${Date.now()}@example.test`;
  const password = 'test-password-not-a-secret';

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`could not create ${label}: ${error?.message}`);

  const client = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const signIn = await client.auth.signInWithPassword({ email, password });
  if (signIn.error) throw new Error(`could not sign in ${label}: ${signIn.error.message}`);

  return { id: data.user.id, email, client };
}

async function claimSlug(base: string): Promise<string> {
  const { data, error } = await admin.rpc('claim_profile_slug', { p_base: base });
  if (error) throw new Error(error.message);
  return data as string;
}

let alice: TestUser;
let bob: TestUser;
const anon = createClient(SUPABASE_URL, ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

beforeAll(async () => {
  alice = await createUser('alice');
  bob = await createUser('bob');

  for (const [user, name] of [
    [alice, 'Alice Alpha'],
    [bob, 'Bob Beta'],
  ] as const) {
    const slug = await claimSlug(name);
    const { error } = await admin.from('profiles').insert({
      id: user.id,
      slug,
      handle: slug,
      display_name: name,
    });
    if (error) throw new Error(`could not seed profile for ${name}: ${error.message}`);
  }
}, 30_000);

afterAll(async () => {
  for (const user of [alice, bob]) {
    if (user) await admin.auth.admin.deleteUser(user.id);
  }
});

describe('profiles', () => {
  it('lets a user read their own row', async () => {
    const { data, error } = await alice.client.from('profiles').select('id').eq('id', alice.id);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it("does not let a user read another user's row by direct id", async () => {
    const { data, error } = await alice.client.from('profiles').select('id').eq('id', bob.id);
    // RLS filters rather than errors — the row simply is not there.
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  it('shows a user exactly one profile in an unfiltered select', async () => {
    const { data } = await alice.client.from('profiles').select('id');
    expect(data).toHaveLength(1);
    expect(data?.[0]?.id).toBe(alice.id);
  });

  it("does not let a user update another user's row", async () => {
    const { data } = await alice.client
      .from('profiles')
      .update({ display_name: 'pwned' })
      .eq('id', bob.id)
      .select();
    expect(data ?? []).toHaveLength(0);

    const { data: bobRow } = await admin
      .from('profiles')
      .select('display_name')
      .eq('id', bob.id)
      .single();
    expect(bobRow?.display_name).toBe('Bob Beta');
  });

  it('does not let a user insert a profile owned by someone else', async () => {
    const slug = await claimSlug('Impostor');
    const { error } = await alice.client
      .from('profiles')
      .insert({ id: bob.id, slug, handle: slug, display_name: 'impostor' });
    expect(error).not.toBeNull();
  });

  it('is unreachable anonymously', async () => {
    const { data, error } = await anon.from('profiles').select('id');
    // Denied at the grant, before RLS filtering — defence in depth.
    expect(error ?? data).toBeTruthy();
    expect(data ?? []).toHaveLength(0);
  });

  it('rejects a slug change and allows a handle change (decision 6)', async () => {
    const { error: slugError } = await alice.client
      .from('profiles')
      .update({ slug: 'brand-new-slug' })
      .eq('id', alice.id);
    expect(slugError?.message).toContain('slug is immutable');

    const { error: handleError } = await alice.client
      .from('profiles')
      .update({ handle: 'alice-renamed', display_name: 'Alice A.' })
      .eq('id', alice.id);
    expect(handleError).toBeNull();
  });

  it('defaults locale to en', async () => {
    const { data } = await admin.from('profiles').select('locale').eq('id', bob.id).single();
    expect(data?.locale).toBe('en');
  });
});

describe('taxonomy', () => {
  it('is readable anonymously, because signup needs it before a session exists', async () => {
    const { data, error } = await anon.from('institutions').select('slug');
    expect(error).toBeNull();
    expect(data?.length).toBeGreaterThan(50);
    expect(data?.map((row) => row.slug)).toContain('upv');
  });

  it('exposes UPV degrees', async () => {
    const { data } = await anon
      .from('degrees')
      .select('slug, institutions!inner(slug)')
      .eq('institutions.slug', 'upv');
    expect(data?.length).toBeGreaterThan(10);
  });

  it('is not writable by a signed-in user', async () => {
    const { error } = await alice.client
      .from('institutions')
      .insert({ slug: 'fake-uni', name: 'Fake', country: 'ES' });
    expect(error).not.toBeNull();
  });
});

describe('institution_requests', () => {
  it('lets a user file a request for themselves', async () => {
    const { error } = await alice.client
      .from('institution_requests')
      .insert({ user_id: alice.id, name: 'Universidad de Prueba', country: 'ES' });
    expect(error).toBeNull();
  });

  it('does not let a user file a request in someone else\'s name', async () => {
    const { error } = await alice.client
      .from('institution_requests')
      .insert({ user_id: bob.id, name: 'Forged', country: 'ES' });
    expect(error).not.toBeNull();
  });

  it("does not let a user read another user's requests", async () => {
    await admin
      .from('institution_requests')
      .insert({ user_id: bob.id, name: 'Bob private request', country: 'ES' });

    const { data } = await alice.client.from('institution_requests').select('name');
    expect(data?.map((row) => row.name)).not.toContain('Bob private request');
  });

  it('does not create an institution row as a side effect', async () => {
    const { data } = await anon.from('institutions').select('slug').eq('slug', 'universidad-de-prueba');
    expect(data).toHaveLength(0);
  });
});
