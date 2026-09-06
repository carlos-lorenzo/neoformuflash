import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

/*
 * check-migration-drift blocks `pnpm dev` whenever `.env.local` targets a
 * hosted project whose applied migrations are behind supabase/migrations/*.sql.
 * It exists because two migrations (0009, 0015) shipped exactly this way and
 * broke signup on the hosted project (specs/EVOLUTION.md).
 *
 * The DB-backed branches (compare against schema_migrations, list pending) are
 * exercised by hand against a running stack; the non-DB contract is what runs
 * here — a guard that silently skips is the failure mode both incidents had, so
 * the "fail closed" and "short-circuit" decisions are the load-bearing logic.
 */

const roots: string[] = [];

function fixtureDir(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'migration-drift-'));
  roots.push(dir);
  for (const [path, content] of Object.entries(files)) {
    const full = join(dir, path);
    const parent = path.includes('/') ? join(dir, path.slice(0, path.lastIndexOf('/'))) : dir;
    mkdirSync(parent, { recursive: true });
    writeFileSync(full, content);
  }
  return dir;
}

const SCRIPT = join(fileURLToPath(new URL('.', import.meta.url)), 'check-migration-drift.mjs');

function run(
  dir: string,
  env: Record<string, string> = {}
): { status: number; output: string } {
  try {
    const merged = {
      SUPABASE_DB_URL: '',
      NEXT_PUBLIC_SUPABASE_URL: '',
      SKIP_MIGRATION_DRIFT_CHECK: '',
      ...env,
    };
    const output = execFileSync('node', [SCRIPT], {
      encoding: 'utf8',
      stdio: 'pipe',
      cwd: dir,
      // A test cwd has no .env.local, so env vars are the only input.
      env: { ...process.env, ...merged },
    });
    return { status: 0, output };
  } catch (error) {
    const err = error as { status: number; stdout: string; stderr: string };
    return { status: err.status, output: `${err.stdout}${err.stderr}` };
  }
}

const NO_ENV = {}; // no NEXT_PUBLIC_SUPABASE_URL anywhere
const LOCAL = { NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321' };
const HOSTED_NO_DB = { NEXT_PUBLIC_SUPABASE_URL: 'https://fake.supabase.co' };

afterAll(() => {
  for (const dir of roots) rmSync(dir, { recursive: true, force: true });
});

describe('check-migration-drift: non-DB contract', () => {
  it('passes when no project is configured — nothing can drift', () => {
    const { status, output } = run(fixtureDir({}), NO_ENV);
    expect(status).toBe(0);
    expect(output).toContain('no NEXT_PUBLIC_SUPABASE_URL');
  });

  it('passes on a local target — db:reset replays every migration', () => {
    const { status, output } = run(fixtureDir({}), LOCAL);
    expect(status).toBe(0);
    expect(output).toContain('local target');
  });

  /*
   * The fail-closed case. A hosted target whose migration state cannot be read
   * is exactly how both drift incidents shipped (the read failed, nothing
   * noticed, signup broke). Skipping here would recreate the hole.
   */
  it('blocks a hosted target with no SUPABASE_DB_URL', () => {
    const { status, output } = run(fixtureDir({}), HOSTED_NO_DB);
    expect(status).toBe(1);
    expect(output).toContain('SUPABASE_DB_URL is not set');
  });

  it('honours the explicit bypass for an offline session', () => {
    const { status } = run(fixtureDir({}), {
      ...HOSTED_NO_DB,
      SKIP_MIGRATION_DRIFT_CHECK: '1',
    });
    expect(status).toBe(0);
  });

  it('rejects a malformed NEXT_PUBLIC_SUPABASE_URL', () => {
    const { status, output } = run(fixtureDir({}), {
      NEXT_PUBLIC_SUPABASE_URL: 'not a url',
    });
    expect(status).toBe(1);
    expect(output).toContain('not a valid URL');
  });
});
