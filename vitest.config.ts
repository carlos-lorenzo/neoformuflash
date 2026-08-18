import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Next resolves `@/*` from tsconfig; Vite does not read tsconfig paths, so the
// component tests need it spelled out or every `@/lib/...` import fails to resolve.
const alias = { '@': fileURLToPath(new URL('.', import.meta.url).href).replace(/\/$/, '') };

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
        resolve: { alias },
        test: {
          name: 'unit',
          include: [
            'scripts/**/*.test.ts',
            'lib/**/*.test.ts',
            'lib/**/*.test.tsx',
            'packages/**/*.test.ts',
            // Component tests belong here by the same rule: no services needed.
            // They opt into jsdom per file with a `@vitest-environment` docblock
            // rather than paying for a DOM in every node test.
            'components/**/*.test.tsx',
          ],
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
