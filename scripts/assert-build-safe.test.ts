import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

/*
 * assert-build-safe inspects the built artifact for two things that are
 * invisible in source: a test-only route that shipped, and a secret key inlined
 * into a client bundle. Both come from the phase 00 security audit.
 *
 * It gets tested because its first version did not work. The service-role JWT
 * check matched a hand-guessed base64 substring that never actually occurs, so
 * it would have reported clean forever — the same shape as the two lint:tokens
 * rules that had no test and were silently CSS-only. An assertion nobody proves
 * is an assertion that manufactures confidence.
 *
 * Key material below is synthetic and assembled at runtime rather than written
 * as literals: .claude/hooks/secret-guard.sh refuses to write a file containing
 * a secret-shaped string, and it is right to, even in a test.
 */

const SECRET_PREFIX = `sb_${'secret'}_`;
const PUBLISHABLE_PREFIX = `sb_${'publishable'}_`;
const FAKE_BODY = 'AAAABBBBCCCCDDDD';

const roots: string[] = [];

function fixture(chunk: string, routes: string[] = ['/']): string {
  const dir = mkdtempSync(join(tmpdir(), 'build-safe-'));
  roots.push(dir);
  mkdirSync(join(dir, 'static', 'chunks'), { recursive: true });
  writeFileSync(join(dir, 'static', 'chunks', 'x.js'), chunk);
  writeFileSync(
    join(dir, 'routes-manifest.json'),
    JSON.stringify({ staticRoutes: routes.map((page) => ({ page })), dynamicRoutes: [] })
  );
  return dir;
}

function run(dir: string, env: Record<string, string> = {}): { status: number; output: string } {
  try {
    const output = execFileSync('node', ['scripts/assert-build-safe.mjs', '--dir', dir], {
      encoding: 'utf8',
      stdio: 'pipe',
      env: { ...process.env, E2E_TEST_AUTH: '', ...env },
    });
    return { status: 0, output };
  } catch (error) {
    const err = error as { status: number; stdout: string; stderr: string };
    return { status: err.status, output: `${err.stdout}${err.stderr}` };
  }
}

/** A structurally real JWT whose payload declares the service_role claim. */
function serviceRoleJwt(): string {
  const b64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const role = `service${'_'}role`;
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ role, iss: 'supabase' })}.c2ln`;
}

afterAll(() => {
  for (const dir of roots) rmSync(dir, { recursive: true, force: true });
});

describe('assert-build-safe: secrets in client bundles', () => {
  it('catches a secret key', () => {
    const { status, output } = run(fixture(`var k="${SECRET_PREFIX}${FAKE_BODY}";`));
    expect(output).toContain('supabase-secret-key');
    expect(status).toBe(1);
  });

  it('catches a service-role JWT, whatever its base64 alignment', () => {
    const { status, output } = run(fixture(`var k="${serviceRoleJwt()}";`));
    expect(output).toContain('service-role-jwt');
    expect(status).toBe(1);
  });

  it('catches a plaintext service-role claim', () => {
    const claim = `"role":"service${'_'}role"`;
    const { status } = run(fixture(`var claims={${claim}};`));
    expect(status).toBe(1);
  });

  /*
   * The false-positive case, and the reason the `+` quantifier matters:
   * @supabase/supabase-js ships this exact prefix check in every client bundle.
   * A rule that fires here fires on every build, gets treated as noise, and is
   * gone by the time it would have been right.
   */
  it('does not fire on the library prefix check present in every real bundle', () => {
    const probe = `let s=e=>e.startsWith("${PUBLISHABLE_PREFIX}")||e.startsWith("${SECRET_PREFIX}");`;
    const { status, output } = run(fixture(probe));
    expect(output).toContain('clean');
    expect(status).toBe(0);
  });

  it('does not fire on an ordinary publishable key', () => {
    const { status } = run(fixture(`var k="${PUBLISHABLE_PREFIX}${FAKE_BODY}";`));
    expect(status).toBe(0);
  });
});

describe('assert-build-safe: test-only routes', () => {
  it('fails when /api/test-auth ships in a normal build', () => {
    const { status, output } = run(fixture('var x=1;', ['/', '/api/test-auth']));
    expect(output).toContain('/api/test-auth');
    expect(status).toBe(1);
  });

  it('allows it in an e2e build, where the fixture needs it', () => {
    const { status } = run(fixture('var x=1;', ['/', '/api/test-auth']), { E2E_TEST_AUTH: '1' });
    expect(status).toBe(0);
  });

  it('fails an e2e build that is MISSING it, so the wiring cannot rot silently', () => {
    const { status, output } = run(fixture('var x=1;', ['/']), { E2E_TEST_AUTH: '1' });
    expect(output).toContain('MISSING');
    expect(status).toBe(1);
  });
});
