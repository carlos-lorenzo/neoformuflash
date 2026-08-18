import Link from 'next/link';
import type { Route } from 'next';
import { getTranslations } from 'next-intl/server';

/*
 * Server: shared chrome for /login and /signup — the ruled grid (§8), the
 * centred max-w-auth card, and the header row (brand left, login/signup toggle
 * right, per refs/06-auth "Peripheral Navigation"). The two screens differ
 * enough below the header that only this shell is shared.
 *
 * The toggle link is an `<a>`; the global `:focus-visible` rule paints the
 * focus ring, so no per-element outline classes are needed.
 */
export async function AuthShell({
  mode,
  children,
}: {
  mode: 'login' | 'signup';
  children: React.ReactNode;
}) {
  const t = await getTranslations(mode);
  const isLogin = mode === 'login';
  // Typed routes reject a bare union; annotate so both branches resolve.
  const toggleHref: Route = isLogin ? '/signup' : '/login';

  return (
    <main className="ruled-grid flex min-h-screen flex-col items-center justify-center px-4">
      <div className="w-full max-w-auth rounded-lg border border-subtle bg-raised p-6">
        <div className="flex items-center justify-between">
          {/* i18n-exempt — brand name */}
          <p className="text-ui-sm font-medium text-secondary">FormuFlash</p>
          <Link
            href={toggleHref}
            className="h-11 flex items-center text-ui-sm text-secondary transition-colors duration-instant ease-out hover:text-primary min-h-11"
          >
            {isLogin ? t('toggleSignup') : t('toggleLogin')} {/* i18n-dynamic-key */}
          </Link>
        </div>
        {children}
      </div>
    </main>
  );
}
