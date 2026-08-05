import { execFileSync } from 'node:child_process';

/*
 * Populate Supabase connection details for the RLS suite by asking the CLI,
 * rather than reading them from a committed .env file.
 *
 * Two reasons. The local stack's keys are fixed and public, so committing them
 * would teach the habit of putting keys in the repo for no benefit. And asking
 * the running stack means the tests fail with "supabase is not running" instead
 * of failing with a confusing auth error against a stack that moved ports.
 *
 * Real values (a hosted project, CI) come from the environment and always win.
 */

function readLocalStackEnv(): Record<string, string> {
  const raw = execFileSync('pnpm', ['exec', 'supabase', 'status', '-o', 'env'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });

  return Object.fromEntries(
    raw
      .split('\n')
      .map((line) => line.match(/^([A-Z0-9_]+)="(.*)"$/))
      .filter((match): match is RegExpMatchArray => match !== null)
      .map((match) => [match[1] as string, match[2] as string])
  );
}

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  let local: Record<string, string>;
  try {
    local = readLocalStackEnv();
  } catch {
    throw new Error(
      'The local Supabase stack is not running. Start it with `pnpm db:start` before `pnpm test:rls`.'
    );
  }

  process.env.NEXT_PUBLIC_SUPABASE_URL ??= local.API_URL;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= local.ANON_KEY;
  process.env.SUPABASE_SERVICE_ROLE_KEY ??= local.SERVICE_ROLE_KEY;
  // Direct Postgres, not PostgREST: the grants audit reads information_schema,
  // which the REST API never exposes. tests/db/grants.test.ts is the consumer.
  process.env.SUPABASE_DB_URL ??= local.DB_URL;
}

/*
 * Wait for the stack to actually serve requests before any test file runs.
 *
 * This is the diagnosis of the flake that had been reported-but-unexplained for
 * three sessions ("one failure in 22+ runs, cause unidentified"). The error,
 * finally captured, is PostgREST's:
 *
 *     Could not query the database for the schema cache. Retrying.
 *
 * `supabase db reset` ends by restarting containers and the CLI returns once
 * Postgres accepts connections — which is strictly earlier than PostgREST
 * having rebuilt its schema cache. Until it has, every `.rpc()` and every table
 * read fails. Files run sequentially (`fileParallelism: false`), so whichever
 * runs first absorbs the whole warm-up window and its tests fail together,
 * looking like a logic bug in that one file. Re-running always passed, because
 * by then the stack was warm — which is exactly what made it read as noise.
 *
 * Two lessons worth keeping. A green re-run is not a diagnosis. And "the
 * service is healthy" is a different claim from "the service answers the
 * request I am about to make" — so this probes the actual data path (a table
 * read and an RPC) rather than a health endpoint, because auth /health returned
 * 200 throughout the failure that finally exposed this.
 */
const READY_TIMEOUT_MS = 60_000;
const POLL_INTERVAL_MS = 250;

const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const probes: { name: string; url: string; init: RequestInit }[] = [
  {
    name: 'auth',
    url: new URL('/auth/v1/health', baseUrl).toString(),
    init: {},
  },
  {
    // PostgREST table read — fails while the schema cache is cold.
    name: 'rest',
    url: new URL('/rest/v1/institutions?select=slug&limit=1', baseUrl).toString(),
    init: { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } },
  },
  {
    // And an RPC, because functions are what the suite actually calls and what
    // was failing. Read-only: it reports a free slug and claims nothing.
    name: 'rpc',
    url: new URL('/rest/v1/rpc/claim_profile_slug', baseUrl).toString(),
    init: {
      method: 'POST',
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_base: 'readiness probe' }),
    },
  },
];

const deadline = Date.now() + READY_TIMEOUT_MS;
let lastFailure = 'no attempt made';
let ready = false;

while (!ready && Date.now() < deadline) {
  ready = true;
  for (const probe of probes) {
    try {
      const response = await fetch(probe.url, {
        ...probe.init,
        signal: AbortSignal.timeout(5_000),
      });
      if (!response.ok) {
        lastFailure = `${probe.name}: HTTP ${response.status} ${(await response.text()).slice(0, 200)}`;
        ready = false;
        break;
      }
    } catch (error) {
      lastFailure = `${probe.name}: ${error instanceof Error ? error.message : String(error)}`;
      ready = false;
      break;
    }
  }
  if (!ready) await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
}

if (!ready) {
  throw new Error(
    `The local Supabase stack did not become ready within ${READY_TIMEOUT_MS / 1000}s ` +
      `(last failure — ${lastFailure}). If the containers are up, this is a real outage rather ` +
      'than the usual post-reset warm-up.'
  );
}
