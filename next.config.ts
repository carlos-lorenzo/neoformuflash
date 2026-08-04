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

const nextConfig: NextConfig = {
  // packages/contracts ships raw TypeScript rather than a build step.
  transpilePackages: ['@neoformuflash/contracts'],
  typedRoutes: true,
};

export default withNextIntl(nextConfig);
