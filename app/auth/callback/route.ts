import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { hasProfile } from '@/lib/db/profiles';

/*
 * OAuth return leg. Exchange the code for a session, then branch:
 *   no profile row  -> /onboarding  (first run)
 *   profile exists  -> /app         (returning user, AC 2)
 *
 * The branch is on the PROFILE, not on anything Supabase reports about the
 * user being new. A student who abandons onboarding halfway has an auth user
 * and no profile; keying off `created_at` would drop them on an empty dashboard
 * they can never fill in.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get('code');
  const oauthError = searchParams.get('error');

  if (oauthError || !code) {
    return NextResponse.redirect(`${origin}/login?error=oauth`);
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.user) {
    return NextResponse.redirect(`${origin}/login?error=oauth`);
  }

  const profileExists = await hasProfile(data.user.id);
  return NextResponse.redirect(`${origin}${profileExists ? '/app' : '/onboarding'}`);
}
