import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, describe, expect, it } from 'vitest';

/*
 * 0015_open_taxonomy.sql — the signup taxonomy after it was opened up.
 *
 * Two things are being asserted, and they pull in opposite directions:
 *
 *   1. ANY student can record ANY university, worldwide, in any script,
 *      without a moderator. That is the feature — the closed 27-row Spanish
 *      list was what stopped people finishing signup.
 *   2. NOBODY can write to `institutions` directly. The only write path is
 *      find_or_create_institution(), which is `security definer` and is
 *      deliberately NOT granted to `anon` or `authenticated`; create_profile()
 *      calls it as the owner.
 *
 * (2) is the part with teeth. Postgres grants EXECUTE on a new function to
 * PUBLIC by default, so an explicit `grant ... to authenticated` without a
 * matching `revoke ... from public` is decorative — that is exactly how 0001
 * shipped an anonymous user-existence oracle (EVOLUTION 2026-08-04). Here the
 * function WRITES, so the same mistake would be an unauthenticated insert into
 * a shared table.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const anon = createClient(SUPABASE_URL, ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const createdUserIds: string[] = [];

async function signedInClient(label: string): Promise<SupabaseClient> {
  const email = `tax-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;
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

/* eslint-disable @typescript-eslint/no-explicit-any -- generated Args omit Postgres parameter nullability */
const profileArgs = (overrides: Record<string, unknown> = {}) =>
  ({
    p_display_name: 'Taxonomy Test',
    p_avatar_url: null,
    p_locale: 'en',
    p_institution_name: null,
    p_degree_text: null,
    ...overrides,
  }) as any;
/* eslint-enable @typescript-eslint/no-explicit-any */

afterAll(async () => {
  for (const id of createdUserIds) await admin.auth.admin.deleteUser(id);
});

describe('find_or_create_institution — the write boundary', () => {
  it('is NOT executable by anon', async () => {
    const { error } = await anon.rpc('find_or_create_institution', { p_name: 'Anon University' });
    expect(error).not.toBeNull();
  });

  it('is NOT executable by a signed-in user either', async () => {
    // The definer path runs it; a caller never should. If this ever passes,
    // any account can write rows into a table shared by every user.
    const client = await signedInClient('authed-rpc');
    const { error } = await client.rpc('find_or_create_institution', {
      p_name: 'Authenticated University',
    });
    expect(error).not.toBeNull();
  });

  it('leaves institutions unwritable directly, by anon or by a user', async () => {
    const anonWrite = await anon
      .from('institutions')
      .insert({ slug: `anon-${Date.now()}`, name: 'Anon Direct' });
    expect(anonWrite.error).not.toBeNull();

    const client = await signedInClient('direct-insert');
    const userWrite = await client
      .from('institutions')
      .insert({ slug: `user-${Date.now()}`, name: 'User Direct' });
    expect(userWrite.error).not.toBeNull();
  });
});

describe('create_profile — the only way an institution is created', () => {
  it('records a university nobody has entered before', async () => {
    const name = `University of Nowhere ${Date.now()}`;
    const client = await signedInClient('new-uni');

    const { data, error } = await client.rpc('create_profile', profileArgs({
      p_institution_name: name,
    }));
    expect(error).toBeNull();

    const institutionId = (data as { institution_id: string | null }).institution_id;
    expect(institutionId).toBeTruthy();

    const { data: row } = await admin
      .from('institutions')
      .select('name, country')
      .eq('id', institutionId!)
      .single();
    expect(row?.name).toBe(name);
    // No country is guessed from a name typed by a student.
    expect(row?.country).toBeNull();
  }, 20_000);

  it('points two students at ONE row despite case, accents and whitespace', async () => {
    // This is the whole defence against the duplicate-taxonomy problem that
    // ADR-002 decision 2 closed the list to prevent.
    const stamp = Date.now();
    const a = await signedInClient(`same-a-${stamp}`);
    const b = await signedInClient(`same-b-${stamp}`);

    const first = await a.rpc('create_profile', profileArgs({
      p_institution_name: `Universitat Politècnica de Test ${stamp}`,
    }));
    const second = await b.rpc('create_profile', profileArgs({
      p_institution_name: `  universitat politecnica de test ${stamp}  `,
    }));

    expect(first.error).toBeNull();
    expect(second.error).toBeNull();
    expect((second.data as { institution_id: string }).institution_id).toBe(
      (first.data as { institution_id: string }).institution_id
    );
  }, 30_000);

  it('accepts a non-Latin name — a student at 東京大学 must be able to sign up', async () => {
    const name = `東京大学 ${Date.now()}`;
    const client = await signedInClient('cjk');

    const { data, error } = await client.rpc('create_profile', profileArgs({
      p_institution_name: name,
    }));
    expect(error).toBeNull();

    const { data: row } = await admin
      .from('institutions')
      .select('name, slug')
      .eq('id', (data as { institution_id: string }).institution_id)
      .single();
    expect(row?.name).toBe(name);
    // Slugifies to nothing, so it gets a generated slug rather than an error.
    expect(row?.slug).toMatch(/^[a-z0-9][a-z0-9_-]{2,}$/);
  }, 20_000);

  it('creates NO institution row when the field is skipped', async () => {
    const before = await admin.from('institutions').select('id', { count: 'exact', head: true });
    const client = await signedInClient('skip-uni');

    const { data, error } = await client.rpc('create_profile', profileArgs({
      p_institution_name: '   ',
      p_degree_text: '   ',
    }));
    expect(error).toBeNull();
    expect((data as { institution_id: string | null }).institution_id).toBeNull();
    // Blank is "skipped", not "an institution called nothing".
    expect((data as { degree_text: string | null }).degree_text).toBeNull();

    const after = await admin.from('institutions').select('id', { count: 'exact', head: true });
    expect(after.count).toBe(before.count);
  }, 20_000);

  it('stores a degree with no university at all', async () => {
    // The old schema refused this outright; it is why the degree field
    // disappeared for anyone outside the seeded list.
    const client = await signedInClient('degree-only');

    const { data, error } = await client.rpc('create_profile', profileArgs({
      p_institution_name: null,
      p_degree_text: 'Astrophysics',
    }));
    expect(error).toBeNull();
    expect((data as { degree_text: string }).degree_text).toBe('Astrophysics');
    expect((data as { institution_id: string | null }).institution_id).toBeNull();
  }, 20_000);
});

describe('search_institutions', () => {
  /** The RPC's row shape. The untyped `anon` client widens it to any. */
  type Hit = { id: string; slug: string; name: string };
  const names = (data: unknown): string[] => ((data ?? []) as Hit[]).map((row) => row.name);

  const stamp = Date.now();
  const NAMES = [
    `Massachusetts Institute of Testing ${stamp}`,
    `Universitat Politècnica de Prova ${stamp}`,
    `University of Bathwater ${stamp}`,
  ];

  async function seed() {
    for (const name of NAMES) {
      const client = await signedInClient(`search-${NAMES.indexOf(name)}-${stamp}`);
      await client.rpc('create_profile', profileArgs({ p_institution_name: name }));
    }
  }

  it('is readable by anon, because signup renders before a session exists', async () => {
    await seed();
    const { error } = await anon.rpc('search_institutions', { p_query: 'University' });
    expect(error).toBeNull();
  }, 40_000);

  it('matches an acronym — how students actually name their university', async () => {
    // "MIT" shares almost no trigrams with the full name and is not a prefix
    // of it, so without institution_acronym() this returns nothing.
    const { data } = await anon.rpc('search_institutions', { p_query: 'MIT' });
    expect(names(data)).toContain(NAMES[0]);
  });

  it('matches through a typo and a missing accent', async () => {
    const { data } = await anon.rpc('search_institutions', { p_query: 'politecnica de prova' });
    expect(names(data)).toContain(NAMES[1]);
  });

  it('returns nothing for a blank query rather than every row on the platform', async () => {
    for (const p_query of ['', '   ']) {
      const { data } = await anon.rpc('search_institutions', { p_query });
      expect(data).toEqual([]);
    }
  });

  it('returns nothing for a query that matches nothing', async () => {
    const { data } = await anon.rpc('search_institutions', { p_query: 'qqqzzzxxx' });
    expect(data).toEqual([]);
  });

  it('caps the result count even when asked for more', async () => {
    const { data } = await anon.rpc('search_institutions', {
      p_query: 'University',
      p_limit: 9999,
    });
    expect(names(data).length).toBeLessThanOrEqual(50);
  });
});
