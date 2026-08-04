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
 * Two independent gates, both of which must hold:
 *
 *   1. E2E_TEST_AUTH must be exactly '1'. Never set in any deploy.
 *   2. The configured Supabase URL must point at localhost. Even if gate 1
 *      were set by mistake in a real environment, this route would refuse,
 *      because a deployed app never points at 127.0.0.1.
 *
 * Gate 2 is the one that matters: it makes a misconfigured environment variable
 * insufficient on its own. Flagged deliberately for the security audit.
 */

function isEnabled(): boolean {
  if (process.env.E2E_TEST_AUTH !== '1') return false;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
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
