import { NextResponse, type NextRequest } from 'next/server';
import type { VerifyOtpParams } from '@supabase/supabase-js';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { hasProfile } from '@/lib/db/profiles';

/*
 * Auth return legs. Two shapes arrive here:
 *
 * 1. OAuth (Google): `?code=...`. Exchange the code for a session.
 * 2. Email confirmation: `?token_hash=...&type=signup`. Verify the token.
 *
 * Both branch on the PROFILE, not on anything Supabase reports about the user
 * being new. A student who abandons onboarding halfway has an auth user and no
 * profile; keying off `created_at` would drop them on an empty dashboard they
 * can never fill in.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams, origin } = request.nextUrl;

  if (searchParams.get('error')) {
    return NextResponse.redirect(`${origin}/login?error=oauth`);
  }

  const supabase = await createSupabaseServerClient();

  // Email-confirmation leg. GoTrue links back with token_hash + type; the type
  // comes from Supabase's own redirect URL, so a value outside the known set
  // simply fails verifyOtp below rather than hitting a lying cast.
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type');
  if (tokenHash && type && OTP_TYPES.has(type)) {
    const { data, error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      // Narrowed to the known OTP types above, so this cast is honest.
      type: type as VerifyOtpParams['type'],
    });
    if (error || !data.user) {
      return NextResponse.redirect(`${origin}/login?error=oauth`);
    }
    return redirectByProfile(origin, data.user.id);
  }

  // OAuth leg.
  const code = searchParams.get('code');
  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=oauth`);
  }

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) {
    return NextResponse.redirect(`${origin}/login?error=oauth`);
  }

  return redirectByProfile(origin, data.user.id);
}

/** The OTP types GoTrue can put on a confirmation link. */
const OTP_TYPES = new Set([
  'email',
  'sms',
  'email_change',
  'recovery',
  'invite',
  'magiclink',
  'phone_change',
  'signup',
]);

async function redirectByProfile(origin: string, userId: string): Promise<NextResponse> {
  const profileExists = await hasProfile(userId);
  return NextResponse.redirect(`${origin}${profileExists ? '/app' : '/onboarding'}`);
}
