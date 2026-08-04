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
}
