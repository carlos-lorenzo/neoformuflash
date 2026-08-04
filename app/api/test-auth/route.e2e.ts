import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/*
 * TEST-ONLY sign-in. Exists because Google OAuth cannot be driven by an
 * automated browser, and the alternative — hand-assembling the @supabase/ssr
 * session cookie in the test fixture — means reverse-engineering an internal
 * format that will silently break on a dependency bump.
 *
 * This route uses the app's own cookie writer, so the session it installs is
 * byte-identical to a real one.
 *
 * ── Why this is not a production backdoor ────────────────────────────────
 * The real defence is that this file is `.e2e.ts`, so it is only compiled into
 * a route when `E2E_TEST_AUTH=1` was set for the BUILD (see next.config.ts's
 * `pageExtensions`). In any other build there is no route to reach.
 *
 * The runtime gates below are defence in depth, and one of them used to be a
 * lie. The security audit found that `process.env.NEXT_PUBLIC_SUPABASE_URL` is
 * inlined by Next at build time, so the localhost check compiled to a constant
 * describing the build machine — it could not refuse a misconfigured runtime,
 * which was the entire claim made for it. It is read dynamically now, via a
 * computed key Next does not inline, so it actually evaluates where the app is
 * running rather than where it was built.
 */

/** Computed key: `process.env[expr]` is not statically inlined the way `process.env.FOO` is. */
function runtimeEnv(name: string): string | undefined {
  return process.env[name];
}

function isEnabled(): boolean {
  if (runtimeEnv('E2E_TEST_AUTH') !== '1') return false;

  // Never in a real deployment, whatever else is misconfigured.
  if (runtimeEnv('VERCEL_ENV') === 'production' || runtimeEnv('VERCEL') === '1') return false;

  const url = runtimeEnv('NEXT_PUBLIC_SUPABASE_URL') ?? '';
  try {
    const { hostname } = new URL(url);
    return hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '::1';
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!isEnabled()) {
    return new NextResponse(null, { status: 404 });
  }

  const { email, password } = (await request.json()) as { email?: string; password?: string };
  if (!email || !password) {
    return NextResponse.json({ error: 'email and password are required' }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }

  return NextResponse.json({ ok: true });
}
