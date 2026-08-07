'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getSessionUser } from '@/lib/supabase/session';

/*
 * Field-keyed errors. The values are message-catalog keys, never prose — the
 * UI translates them, so a Spanish student sees a Spanish validation error.
 *
 * `status: 'check-email'` means the auth user was created but is not confirmed
 * yet (email confirmations enabled, as on the hosted project). The form renders
 * a "check your email" panel instead of an error — the signup did not fail.
 */
export type SignUpState = {
  status: 'idle' | 'check-email';
  email?: string;
  errors: Record<string, string>;
};

/** Must match supabase/config.toml `minimum_password_length`. */
const MIN_PASSWORD_LENGTH = 6;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function signUp(
  _previous: SignUpState,
  formData: FormData
): Promise<SignUpState> {
  const email = asString(formData.get('email'));
  const password = asString(formData.get('password'));
  const passwordConfirm = asString(formData.get('passwordConfirm'));

  // Defense in depth — the middleware also bounces signed-in users off /signup.
  if (await getSessionUser()) redirect('/app');

  if (!email) return { status: 'idle', errors: { email: 'signup.email.required' } };
  if (!EMAIL_RE.test(email)) return { status: 'idle', errors: { email: 'signup.email.invalid' } };
  if (!password) return { status: 'idle', errors: { password: 'signup.password.required' } };
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { status: 'idle', errors: { password: 'signup.password.tooShort' } };
  }
  if (!passwordConfirm) {
    return { status: 'idle', errors: { passwordConfirm: 'signup.passwordConfirm.required' } };
  }
  if (password !== passwordConfirm) {
    return { status: 'idle', errors: { passwordConfirm: 'signup.passwordConfirm.mismatch' } };
  }

  const origin = await appOrigin();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: origin ? `${origin}/auth/callback` : undefined,
      // Suggested display name for onboarding — create_profile() slugifies this,
      // so the raw local part is safe. Google users get `full_name` instead.
      data: { display_name: emailLocalPart(email) },
    },
  });

  if (error) {
    return { status: 'idle', errors: { form: mapSignUpError(error.code) } };
  }

  // Session present (confirmations off, local stack): straight through. The
  // layout's resolveAppEntry sends a no-profile user to /onboarding.
  if (data.session) redirect('/app');

  // Auth user created but not yet confirmed (hosted): not an error.
  if (data.user) return { status: 'check-email', email, errors: {} };

  return { status: 'idle', errors: { form: 'error.unexpected' } };
}

function mapSignUpError(code: string | undefined): string {
  switch (code) {
    case 'user_already_exists':
      return 'signup.errors.emailTaken';
    case 'weak_password':
      return 'signup.errors.weakPassword';
    case 'over_request_rate_limit':
    case 'over_email_send_rate_limit':
      return 'signup.errors.rateLimited';
    case 'validation_failed':
      return 'signup.email.invalid';
    default:
      return 'error.unexpected';
  }
}

/** The part before `@`, lightly cleaned, as a suggested display name. */
function emailLocalPart(email: string): string {
  const local = email.split('@')[0]?.split('+')[0] ?? '';
  return local.replace(/[._-]+/g, ' ').trim() || 'Student';
}

/**
 * Absolute app origin for the confirmation redirect. Server actions have no
 * request URL, so it comes from headers: `origin` when present, else the
 * forwarded scheme + host. Falls back to Supabase's configured default when
 * neither is available.
 */
async function appOrigin(): Promise<string | null> {
  const headerStore = await headers();
  const fromOrigin = headerStore.get('origin');
  if (fromOrigin) return fromOrigin;
  const proto = headerStore.get('x-forwarded-proto') ?? 'http';
  const host = headerStore.get('host');
  return host ? `${proto}://${host}` : null;
}

function asString(value: FormDataEntryValue | null): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}
