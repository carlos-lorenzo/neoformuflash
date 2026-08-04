#!/usr/bin/env node
/*
 * Post-build safety assertions. These check the ARTIFACT, not the source —
 * every issue they catch was invisible in the source and only appeared in what
 * the build actually produced.
 *
 * Both come from the phase 00 security audit:
 *
 *   1. `/api/test-auth` shipped in the production route manifest. Its guard read
 *      NEXT_PUBLIC_SUPABASE_URL, which Next inlines at build time, so it froze
 *      into a literal describing the build machine and could not refuse a
 *      misconfigured runtime.
 *
 *   2. NEXT_PUBLIC_SUPABASE_ANON_KEY was set to the `sb_secret_` key, which
 *      bypasses RLS. Any build with that env inlines it into a public JS chunk
 *      and hands every visitor service-role access. Nothing in the source would
 *      show it; the variable name is legitimate and only the *value* is wrong.
 *
 * Run after `next build`. Exits non-zero on any violation.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** `--dir <path>` points the checks at a fixture so the suite can prove they fire. */
const dirArg = process.argv.indexOf('--dir');
const NEXT_DIR = dirArg !== -1 && process.argv[dirArg + 1] ? process.argv[dirArg + 1] : '.next';
const failures = [];

/* ---- 1. No test-only route may reach a real build ------------------------ */

const FORBIDDEN_ROUTES = ['/api/test-auth'];
const isE2EBuild = process.env.E2E_TEST_AUTH === '1';

try {
  const manifest = JSON.parse(readFileSync(join(NEXT_DIR, 'routes-manifest.json'), 'utf8'));
  const routes = [
    ...(manifest.staticRoutes ?? []),
    ...(manifest.dynamicRoutes ?? []),
  ].map((r) => r.page ?? r.path);

  for (const forbidden of FORBIDDEN_ROUTES) {
    const present = routes.includes(forbidden);
    if (present && !isE2EBuild) {
      failures.push(
        `${forbidden} is in routes-manifest.json but this is not an e2e build.\n` +
          `    A test-only route must never ship. Check next.config.ts pageExtensions.`
      );
    }
    if (!present && isE2EBuild) {
      failures.push(
        `${forbidden} is MISSING from an e2e build — the e2e sign-in fixture will fail.\n` +
          `    Expected because E2E_TEST_AUTH=1. Check the .e2e.ts extension wiring.`
      );
    }
  }
} catch (error) {
  failures.push(`could not read routes-manifest.json: ${error.message}`);
}

/* ---- 2. No secret-shaped value may appear in a client bundle ------------- */

/*
 * Matched on the value, not the variable name. The bug this exists for had a
 * perfectly legitimate name (NEXT_PUBLIC_SUPABASE_ANON_KEY) and a secret value,
 * so any check keyed on naming would have passed it.
 */
/*
 * The `+` quantifiers are load-bearing, not decoration. @supabase/supabase-js
 * ships `e.startsWith("sb_secret_")` as a key-format check, so the bare prefix
 * appears in every client bundle legitimately. A pattern matching the prefix
 * alone fires on every build, gets dismissed as noise, and then the check is
 * either deleted or ignored on the day it is right. Require actual key material.
 */
const SECRET_PATTERNS = [
  { id: 'supabase-secret-key', re: /\bsb_secret_[A-Za-z0-9_-]+/ },
  { id: 'service-role-claim-plaintext', re: /"role"\s*:\s*"service_role"/ },
];

/*
 * JWTs get decoded rather than pattern-matched. A base64 substring only appears
 * at a predictable offset if the payload happens to align, and the first version
 * of this check guessed an alignment that never occurs — it passed review and
 * would have reported clean forever. Decoding has no alignment to get wrong.
 */
const JWT_RE = /\beyJ[A-Za-z0-9_-]{10,}\.([A-Za-z0-9_-]{10,})(?:\.[A-Za-z0-9_-]*)?/g;

function findServiceRoleJwt(source) {
  for (const match of source.matchAll(JWT_RE)) {
    try {
      const payload = Buffer.from(match[1], 'base64url').toString('utf8');
      if (/"role"\s*:\s*"(service_role|supabase_admin)"/.test(payload)) return true;
    } catch {
      // Not a decodable payload; not a JWT we care about.
    }
  }
  return false;
}

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (full.endsWith('.js')) out.push(full);
  }
  return out;
}

// `.next/static` is what the browser downloads. Server chunks legitimately hold
// server-only config, so scanning them would produce noise, not safety.
try {
  for (const file of walk(join(NEXT_DIR, 'static'))) {
    const source = readFileSync(file, 'utf8');
    const hits = SECRET_PATTERNS.filter(({ re }) => re.test(source)).map(({ id }) => id);
    if (findServiceRoleJwt(source)) hits.push('service-role-jwt');

    for (const id of hits) {
      failures.push(
        `${id} found in a CLIENT bundle: ${file}\n` +
          `    This key is served to every visitor. Rotate it, then set\n` +
          `    NEXT_PUBLIC_SUPABASE_ANON_KEY to the PUBLISHABLE key from \`supabase status -o env\`.`
      );
    }
  }
} catch (error) {
  failures.push(`could not scan .next/static: ${error.message}`);
}

/* ---- report -------------------------------------------------------------- */

if (failures.length === 0) {
  console.log(`assert-build-safe — clean${isE2EBuild ? ' (e2e build)' : ''}`);
  process.exit(0);
}

for (const failure of failures) console.error(`  ✗ ${failure}`);
console.error(`\nassert-build-safe — ${failures.length} violation(s).`);
process.exit(1);
