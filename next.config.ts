import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

/*
 * next-intl is used for message catalogs and ICU formatting ONLY.
 * Its routing middleware is deliberately not installed: per decision 7 in
 * specs/01-contracts.md, public content pages are NOT locale-prefixed. A
 * Spanish note lives at one URL, declares <html lang="es"> from its own
 * content language, and is indexed once. Prefixing by interface locale would
 * mint duplicate URLs for content nobody translated — an SEO liability that is
 * very hard to walk back after Google has indexed it.
 */
const withNextIntl = createNextIntlPlugin('./lib/i18n/request.ts');

/*
 * The test-only sign-in route is compiled ONLY when the build itself is an e2e
 * build. `app/api/test-auth/route.e2e.ts` does not match the default page
 * extensions, so in every other build it is an inert file that Next never turns
 * into a route — it is absent from the manifest, not merely guarded at runtime.
 *
 * This replaces a runtime-only defence that did not work. The route used to
 * check that NEXT_PUBLIC_SUPABASE_URL pointed at localhost, but Next inlines
 * NEXT_PUBLIC_* at build time, so that check compiled to a frozen literal
 * describing the *build machine* rather than the running deployment. Meanwhile
 * lib/supabase/server.ts reads the same variable through a dynamic
 * `process.env[name]` lookup, which is not inlined — so the client connected to
 * the real Supabase while the gate still asserted "localhost". A build made
 * against a local stack and deployed with production env was a live backdoor.
 *
 * scripts/assert-no-test-routes.mjs fails the build if it ever ships anyway.
 */
const isE2EBuild = process.env.E2E_TEST_AUTH === '1';

const nextConfig: NextConfig = {
  // packages/contracts ships raw TypeScript rather than a build step.
  transpilePackages: ['@neoformuflash/contracts'],
  typedRoutes: true,
  pageExtensions: [...(isE2EBuild ? ['e2e.ts'] : []), 'ts', 'tsx'],
};

export default withNextIntl(nextConfig);
