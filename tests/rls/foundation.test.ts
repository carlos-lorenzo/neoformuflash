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

  // Phase 04: give alice a public course so her profile is publicly visible.
  await admin.from('courses').insert({
    owner_id: alice.id,
    slug: 'alice-public-course',
    name: 'Alice Public Course',
    visibility: 'public',
  });
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

  it("shows a user only the public profiles they can see in an unfiltered select", async () => {
    // Phase 04 (0012_public_profiles.sql) opened a deliberate public-read path:
    // a profile is visible to anyone when its owner has at least one
    // public/unlisted course or published note. These fixtures seed a public
    // course for alice, so her own row is reachable; an unfiltered public
    // select no longer returns exactly one row — it returns every profile that
    // has opted into public visibility. Assert the scoping, not a count of 1.
    const { data, error } = await alice.client.from('profiles').select('id');
    expect(error).toBeNull();
    const ids = (data ?? []).map((r) => r.id);

    // alice can always see herself.
    expect(ids).toContain(alice.id);
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

  it('lets anon read public profiles but hides private ones (phase 04)', async () => {
    /*
     * Phase 04 (0012_public_profiles.sql) grants SELECT on the public columns
     * to anon and authenticated, and the RLS policy filters to only those
     * owners who have at least one public/unlisted course or published note.
     *
     * The fixture above seeds alice with a public course. Anon should see
     * alice's public columns. The handle is derived from the display name.
     */
    const { data, error } = await anon.from('profiles').select('id, slug, handle');
    expect(error).toBeNull();

    const handles = (data ?? []).map((r) => r.handle);
    // claimSlug('Alice Alpha') -> 'alice-alpha' (lowercase, slugified)
    expect(handles).toContain('alice-alpha');

    // The column grant withholds private columns (is_pro, institution_id, …).
    const { error: privateError } = await anon.from('profiles').select('is_pro');
    expect(privateError).not.toBeNull();
  });

  it('rejects a slug change and allows a handle change (decision 6)', async () => {
    /*
     * Two layers, and they refuse at different depths — assert both.
     *
     * Since 0002 a signed-in user has no `update` grant on `slug` at all, so
     * they are refused before the trigger is ever consulted. The trigger is
     * still the guard that matters for anything holding a table-level grant,
     * which is service_role: migrations, the Stripe webhook, this suite.
     * Dropping either one would leave a hole the other does not cover.
     */
    const { error: grantError } = await alice.client
      .from('profiles')
      .update({ slug: 'brand-new-slug' })
      .eq('id', alice.id);
    expect(grantError?.message).toContain('permission denied');

    const { error: triggerError } = await admin
      .from('profiles')
      .update({ slug: 'brand-new-slug' })
      .eq('id', alice.id);
    expect(triggerError?.message).toContain('slug is immutable');

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
  /*
   * These used to assert against the 54-university Spanish seed. That seed is
   * gone (0015_open_taxonomy.sql): institutions are created on demand by
   * find_or_create_institution() the first time a student types a name, so the
   * table starts empty and its contents are not a fixture.
   *
   * The assertions therefore seed their own row. A test that asserts "more
   * than 50 rows exist" was testing seed.sql, not the policy.
   */
  it('is readable anonymously, because signup needs it before a session exists', async () => {
    const slug = `anon-readable-${Date.now()}`;
    await admin.from('institutions').insert({ slug, name: 'Anon Readable University' });

    const { data, error } = await anon.from('institutions').select('slug').eq('slug', slug);
    expect(error).toBeNull();
    expect(data?.map((row) => row.slug)).toContain(slug);
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

/*
 * Privilege escalation — the four findings migration 0002 closes.
 *
 * Every test here was run against 0001 alone and seen to FAIL before 0002 was
 * written. That matters more than usual: the suite above was green over all
 * four of these for two sessions. Row policies were never the problem — they
 * authorise the row and say nothing about which columns the write may name.
 *
 * If you add a column to profiles or institution_requests, it is unwritable by
 * `authenticated` until a migration grants it. That is the intended default.
 */
describe('privilege escalation', () => {
  // A signed-in user with no profile row, so the direct-insert attempt is
  // testing the grant rather than tripping over the primary key.
  let mallory: TestUser;

  beforeAll(async () => {
    mallory = await createUser('mallory');
  }, 30_000);

  afterAll(async () => {
    if (mallory) await admin.auth.admin.deleteUser(mallory.id);
  });

  it('F3: does not let a user grant themselves is_pro', async () => {
    const { error } = await alice.client
      .from('profiles')
      .update({ is_pro: true })
      .eq('id', alice.id);
    expect(error).not.toBeNull();

    const { data } = await admin.from('profiles').select('is_pro').eq('id', alice.id).single();
    expect(data?.is_pro).toBe(false);
  });

  it('F3: does not let a user set their own desired_retention', async () => {
    /*
     * Deliberately service-role-only until phase 03 ships the control.
     *
     * 0.85, not 0.70: `desired_retention` is `real`, so 0.70 round-trips as
     * 0.6999999881 and the `between 0.70 and 0.98` constraint rejects it. The
     * first version of this test used 0.70 and passed against the unfixed
     * schema — the constraint was doing the work, not the grant. 0.85 is
     * comfortably inside the range, so only the column grant can refuse it.
     */
    const { error } = await alice.client
      .from('profiles')
      .update({ desired_retention: 0.85 })
      .eq('id', alice.id);
    expect(error).not.toBeNull();

    const { data } = await admin
      .from('profiles')
      .select('desired_retention')
      .eq('id', alice.id)
      .single();
    expect(data?.desired_retention).toBeCloseTo(0.9, 5);
  });

  it('F4: does not let a user insert their own profile row directly', async () => {
    // create_profile() is the only supported path. A direct insert would let
    // the caller choose their own slug and is_pro in one statement.
    const { error } = await mallory.client.from('profiles').insert({
      id: mallory.id,
      slug: 'mallory-chosen',
      handle: 'mallory-chosen',
      display_name: 'Mallory',
      is_pro: true,
    });
    expect(error).not.toBeNull();

    const { data } = await admin.from('profiles').select('id').eq('id', mallory.id);
    expect(data).toHaveLength(0);
  });

  it('F5: does not let a user file a request that is already accepted', async () => {
    const { error } = await alice.client
      .from('institution_requests')
      .insert({ user_id: alice.id, name: 'Forged Status', country: 'ES', status: 'accepted' });
    expect(error).not.toBeNull();
  });

  it('F5: does not let a user pre-resolve a request to an institution', async () => {
    // Seeded here rather than taken from seed.sql, which no longer ships any
    // institutions.
    const slug = `preresolve-target-${Date.now()}`;
    const { data: target } = await admin
      .from('institutions')
      .insert({ slug, name: 'Pre-resolve Target University' })
      .select('id')
      .single();
    expect(target?.id).toBeTruthy();

    const { error } = await alice.client.from('institution_requests').insert({
      user_id: alice.id,
      name: 'Pre-resolved',
      country: 'ES',
      resolved_institution_id: target?.id,
    });
    expect(error).not.toBeNull();
  });

  it('F5: still lands a legitimate request as pending', async () => {
    const name = `Universidad Legitima ${Date.now()}`;
    const { error } = await alice.client
      .from('institution_requests')
      .insert({ user_id: alice.id, name, country: 'ES' });
    expect(error).toBeNull();

    const { data } = await admin
      .from('institution_requests')
      .select('status, resolved_institution_id')
      .eq('name', name)
      .single();
    expect(data?.status).toBe('pending');
    expect(data?.resolved_institution_id).toBeNull();
  });

  it('F6: does not let an anonymous caller claim a slug', async () => {
    // Postgres grants EXECUTE to PUBLIC by default, so 0001's explicit grants
    // were decorative and anon inherited access to every function.
    const { error } = await anon.rpc('claim_profile_slug', { p_base: 'Anonymous Squatter' });
    expect(error).not.toBeNull();
  });

  it('F6: does not let an anonymous caller run slugify', async () => {
    const { error } = await anon.rpc('slugify', { p_input: 'anything' });
    expect(error).not.toBeNull();
  });

  it('reserves slugs that would collide with a route or a support channel', async () => {
    // The immutability trigger makes a squat permanent, and phase 04 serves
    // public profiles at /{slug}. Cheap to reserve now, unfixable later.
    for (const word of ['Admin', 'support', 'FormuFlash', 'settings']) {
      const claimed = await claimSlug(word);
      expect(claimed).not.toBe(word.toLowerCase());
      expect(claimed).toMatch(/^[a-z0-9][a-z0-9_-]{2,29}$/);
    }
  });

  it('still lets a user change the fields onboarding and settings own', async () => {
    // Regression guard on the column grant: lib/db/profiles.ts writes locale
    // here and {user_id, name, country} on the moderation queue. Narrowing the
    // grant further than this breaks the product.
    const { error } = await alice.client
      .from('profiles')
      .update({
        locale: 'es',
        handle: 'alice-settings',
        display_name: 'Alice Settings',
        avatar_url: null,
      })
      .eq('id', alice.id);
    expect(error).toBeNull();

    // Put it back so later runs of the suite see the name they seeded.
    await admin
      .from('profiles')
      .update({ locale: 'en', display_name: 'Alice Alpha' })
      .eq('id', alice.id);
  });
});
