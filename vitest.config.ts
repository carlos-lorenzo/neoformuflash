import { defineConfig } from 'vitest/config';

/*
 * Two projects, because they have different prerequisites.
 *
 * `unit` runs anywhere with no services. `rls` needs the local Supabase stack
 * up, so it is a separate project you can run — or skip — on its own. Mixing
 * them means a developer without Docker sees the whole suite fail and learns
 * to ignore red.
 */
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['scripts/**/*.test.ts', 'lib/**/*.test.ts', 'packages/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        test: {
          name: 'rls',
          // Everything under tests/ needs the database. `test:rls` keeps the
          // name specs/01-contracts.md gives it.
          include: ['tests/**/*.test.ts'],
          environment: 'node',
          setupFiles: ['tests/setup/supabase-env.ts'],
          // Policies are global state; parallel suites would race each other.
          fileParallelism: false,
          testTimeout: 20_000,
        },
      },
    ],
  },
});
