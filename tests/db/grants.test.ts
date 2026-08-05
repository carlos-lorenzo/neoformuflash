import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/*
 * AC18 — grant/revoke discipline is a database-level invariant, not an app
 * convention: no table-level INSERT/UPDATE for authenticated, DELETE limited
 * to the allowlist, zero TRUNCATE for anon/authenticated, and every security
 * definer function pins search_path (0007's own comment: "Phase 00 applies
 * this by discipline; nothing enforces it").
 */

let client: Client;

beforeAll(async () => {
  client = new Client({ connectionString: process.env.SUPABASE_DB_URL! });
  await client.connect();
});

afterAll(async () => {
  await client.end();
});

describe('grant discipline (AC18)', () => {
  it('no public table grants table-level INSERT/UPDATE to authenticated', async () => {
    const { rows } = await client.query(
      `select table_name, privilege_type from information_schema.role_table_grants
        where grantee = 'authenticated' and table_schema = 'public'
          and privilege_type in ('INSERT', 'UPDATE')`
    );
    expect(rows).toEqual([]);
  });

  it('DELETE for authenticated appears only on the allowlist', async () => {
    const allowlist = new Set([
      'course_subscriptions',
      'deck_subscriptions',
      'user_api_keys',
      'notes',
      'decks',
      'cards',
    ]);

    const { rows } = await client.query<{ table_name: string }>(
      `select table_name from information_schema.role_table_grants
        where grantee = 'authenticated' and table_schema = 'public'
          and privilege_type = 'DELETE'`
    );

    const tables = rows.map((r) => r.table_name);
    expect(new Set(tables)).toEqual(allowlist);
  });

  it('no table in public grants TRUNCATE to anon or authenticated', async () => {
    const { rows } = await client.query(
      `select table_name, grantee from information_schema.role_table_grants
        where grantee in ('anon', 'authenticated') and table_schema = 'public'
          and privilege_type = 'TRUNCATE'`
    );
    expect(rows).toEqual([]);
  });

  it('authenticated can select user_api_keys metadata but never ciphertext or iv', async () => {
    const { rows } = await client.query<{ column_name: string }>(
      `select column_name from information_schema.column_privileges
        where grantee = 'authenticated' and table_schema = 'public'
          and table_name = 'user_api_keys' and privilege_type = 'SELECT'`
    );
    const columns = rows.map((r) => r.column_name).sort();
    expect(columns).toEqual(['created_at', 'last_four', 'provider', 'user_id']);
  });

  it('every security definer function in public pins search_path', async () => {
    const { rows } = await client.query<{ proname: string; proconfig: string[] | null }>(
      `select p.proname, p.proconfig
         from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.prosecdef = true`
    );

    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      const hasSearchPath = (row.proconfig ?? []).some((entry) => entry.startsWith('search_path='));
      expect(hasSearchPath, `${row.proname} is missing a pinned search_path`).toBe(true);
    }
  });
});
