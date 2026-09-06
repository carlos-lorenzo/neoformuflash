#!/usr/bin/env node
/*
 * Migration-drift guard, run before every `pnpm dev` (package.json "predev").
 *
 * Why this exists (specs/EVOLUTION.md, twice): the hosted Supabase project is a
 * different database from the local stack, and `pnpm db:reset` resets only the
 * local one. When `.env.local` points at hosted, a migration committed but
 * never pushed leaves the app running against a schema that is older than the
 * code — `getProfile` selects a column that does not exist, and every new
 * signup dies on the error panel instead of reaching onboarding. Migration
 * `0009` (keyboard_shortcuts_enabled) and migration `0015` (degree_text) both
 * shipped exactly this way.
 *
 * The guard closes the gap: whenever the dev target is a NON-local project, it
 * compares the migrations present locally against the migrations actually
 * applied on that project and exits non-zero listing the pending ones, so the
 * drift is caught when the migration lands rather than when a user signs up.
 *
 * Fail-closed on purpose: a hosted target whose migration state cannot be read
 * (no SUPABASE_DB_URL, unreachable DB) is exactly the state that shipped both
 * incidents, so it blocks with an actionable message instead of skipping.
 *
 * Usage: node scripts/check-migration-drift.mjs
 *   SKIP_MIGRATION_DRIFT_CHECK=1  bypass the check (offline session, CI).
 */

import { readFileSync, readdirSync } from 'node:fs';
import { Client } from 'pg';

const FAIL_MESSAGES = [
  'Migration drift against the hosted project would break signup and/or the app.',
  'Run, from the repo root:',
  '  pnpm exec supabase migration list --db-url "$SUPABASE_DB_URL"',
  '  pnpm exec supabase db push --db-url "$SUPABASE_DB_URL"',
];

if (process.env.SKIP_MIGRATION_DRIFT_CHECK === '1') {
  console.log('check-migration-drift — skipped (SKIP_MIGRATION_DRIFT_CHECK=1)');
  process.exit(0);
}

/* ---------- read .env.local the way Next resolves it (highest priority) --- */

function readDotEnvLocal() {
  try {
    const raw = readFileSync('.env.local', 'utf8');
    const env = {};
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      env[key] = value;
    }
    return env;
  } catch {
    return {};
  }
}

const dotEnvLocal = readDotEnvLocal();
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? dotEnvLocal.NEXT_PUBLIC_SUPABASE_URL;
const dbUrl = process.env.SUPABASE_DB_URL ?? dotEnvLocal.SUPABASE_DB_URL;

if (!supabaseUrl) {
  // Nothing points at any project; nothing can drift. Not an error.
  console.log('check-migration-drift — no NEXT_PUBLIC_SUPABASE_URL, nothing to check');
  process.exit(0);
}

let host;
try {
  host = new URL(supabaseUrl).hostname;
} catch {
  console.error('check-migration-drift — NEXT_PUBLIC_SUPABASE_URL is not a valid URL.');
  process.exit(1);
}

const isLocalHost = host === 'localhost' || host === '127.0.0.1' || host.endsWith('.localhost');
if (isLocalHost) {
  // `pnpm db:reset` replays every migration locally, so the local stack cannot
  // drift from supabase/migrations/*.sql. Nothing to check.
  console.log('check-migration-drift — local target, migrations are applied by db:reset');
  process.exit(0);
}

/* ---------- hosted target: compare local migrations to applied ones -------- */

const LOCAL_MIGRATION_RE = /^(\d+)_/;

function localMigrationVersions() {
  return readdirSync('supabase/migrations')
    .filter((file) => file.endsWith('.sql'))
    .map((file) => {
      const match = file.match(LOCAL_MIGRATION_RE);
      return match ? match[1] : null;
    })
    .filter((version) => version !== null);
}

if (!dbUrl) {
  console.error(
    'check-migration-drift — .env.local points at the hosted project (' +
      `${host}) but SUPABASE_DB_URL is not set.\n` +
      '  A hosted target whose migration state cannot be read is exactly how both\n' +
      '  migration-drift incidents shipped. Add the hosted Postgres connection string\n' +
      '  (project → Connect → connection string) as SUPABASE_DB_URL in .env.local,\n' +
      '  or point NEXT_PUBLIC_SUPABASE_URL at the local stack.'
  );
  process.exit(1);
}

const dbHost = dbHostnameFromUrl(dbUrl) ?? host;
const applied = await queryAppliedMigrations(dbUrl, dbHost);

if (applied instanceof Error) {
  console.error(
    `check-migration-drift — could not read applied migrations on ${host}.\n` +
      `  ${applied.message}\n` +
      '  The check fails closed: an unreadable hosted DB is the state that shipped drift.\n' +
      '  Fix the connection (SUPABASE_DB_URL, network restrictions) or set\n' +
      '  SKIP_MIGRATION_DRIFT_CHECK=1 to bypass for this session.'
  );
  process.exit(1);
}

const pending = localMigrationVersions().filter((version) => !applied.has(version));

if (pending.length > 0) {
  console.error(
    'check-migration-drift — the hosted project is missing migration(s):\n' +
      pending.map((version) => `  ${version}_*.sql`).join('\n') +
      '\n\n' +
      FAIL_MESSAGES.join('\n')
  );
  process.exit(1);
}

console.log(`check-migration-drift — ${host} is up to date`);
process.exit(0);

/* ---------- helpers -------------------------------------------------------- */

/*
 * Read the applied migration versions. `pg` is a devDependency (used by the RLS
 * suite), which is fine here: predev runs in the dev tree, never in a build.
 *
 * supabase_migrations.schema_migrations.version stores the leading numeric part
 * of each migration filename. Hosted projects require TLS; the local stack
 * rejects it, so TLS is toggled on whether the CONNECTION target is loopback,
 * not on the app URL (which can point anywhere while the DB URL is local).
 */
async function queryAppliedMigrations(connectionString, dbHostname) {
  const client = new Client({
    connectionString,
    connectionTimeoutMillis: 8_000,
    query_timeout: 8_000,
    ssl: isLoopback(dbHostname) ? undefined : { rejectUnauthorized: false },
  });

  try {
    await client.connect();
    const { rows } = await client.query(
      'select version from supabase_migrations.schema_migrations'
    );
    const applied = new Set();
    for (const row of rows) {
      const match = String(row.version).match(/^(\d+)/);
      if (match) applied.add(match[1]);
    }
    return applied;
  } catch (error) {
    return error instanceof Error ? error : new Error(String(error));
  } finally {
    await client.end().catch(() => {});
  }
}

function dbHostnameFromUrl(connectionString) {
  try {
    return new URL(connectionString).hostname;
  } catch {
    return null;
  }
}

function isLoopback(hostname) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}
