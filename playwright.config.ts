import { execFileSync } from 'node:child_process';
import { defineConfig, devices } from '@playwright/test';

/**
 * Read the local stack's connection details from the Supabase CLI.
 *
 * The suite builds and starts its own server, so it needs these regardless of
 * whether a developer has written .env.local. Asking the CLI means one less
 * piece of setup between a fresh clone and a green run, and it means CI needs
 * no secrets — the local keys are fixed, public, and localhost-only.
 */
function localSupabaseEnv(): Record<string, string> {
  const explicit = {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
  };
  if (explicit.NEXT_PUBLIC_SUPABASE_URL && explicit.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return explicit;
  }

  try {
    const raw = execFileSync('pnpm', ['exec', 'supabase', 'status', '-o', 'env'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const values = Object.fromEntries(
      raw
        .split('\n')
        .map((line) => line.match(/^([A-Z0-9_]+)="(.*)"$/))
        .filter((match): match is RegExpMatchArray => match !== null)
        .map((match) => [match[1] as string, match[2] as string])
    );

    return {
      NEXT_PUBLIC_SUPABASE_URL: values.API_URL ?? '',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: values.ANON_KEY ?? '',
      SUPABASE_SERVICE_ROLE_KEY: values.SERVICE_ROLE_KEY ?? '',
    };
  } catch {
    throw new Error(
      'The local Supabase stack is not running. Start it with `pnpm db:start` before `pnpm test:e2e`.'
    );
  }
}

const supabaseEnv = localSupabaseEnv();
// The fixtures talk to Supabase directly from the test process too.
Object.assign(process.env, supabaseEnv);

/*
 * The three widths from design-system.md §6 are projects rather than a loop
 * inside each test, so a failure names the width that broke.
 *
 * 390 is the one that matters most: it is where horizontal scroll, sub-44px
 * targets and pseudo-locale overflow actually show up.
 */
/*
 * Port 3100, not 3000. The e2e suite builds and starts its own production
 * server; sharing the dev port means the suite either fights `pnpm dev` for the
 * socket or silently tests a stale dev build. Neither failure is obvious.
 */
const PORT = Number(process.env.PLAYWRIGHT_PORT ?? 3100);
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],

  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'mobile-390',
      use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 } },
    },
    {
      name: 'tablet-768',
      use: { ...devices['Desktop Chrome'], viewport: { width: 768, height: 1024 } },
    },
    {
      name: 'desktop-1440',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
  ],

  webServer: {
    // Production build, not `next dev`: dev-mode timings and error overlays
    // make screenshots and axe runs disagree with what users actually get.
    command: `pnpm build && pnpm start --port ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      ...supabaseEnv,
      // Enables the test-only sign-in route, which additionally refuses to run
      // unless Supabase points at localhost. See app/api/test-auth/route.ts.
      E2E_TEST_AUTH: '1',
    },
  },
});
