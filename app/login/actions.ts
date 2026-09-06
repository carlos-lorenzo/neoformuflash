'use server';

import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getSessionUser } from '@/lib/supabase/session';
import {
  classifyAuthError,
  isUnexpectedFailure,
  type AuthFailure,
} from '@/lib/auth/classify-error';

/*
 * Field-keyed errors. The values are message-catalog keys, never prose — the
 * UI translates them, so a Spanish student sees a Spanish validation error.
 */
export type SignInState = {
  errors: Record<string, string>;
};

export async function signInWithPassword(
  _previous: SignInState,
  formData: FormData
): Promise<SignInState> {
  const email = asString(formData.get('email'));
  const password = asString(formData.get('password'));

  if (!email) return { errors: { email: 'login.email.required' } };
  if (!password) return { errors: { password: 'login.password.required' } };

  // Defense in depth — the middleware also bounces signed-in users off /login,
  // but a stale tab can hit the action directly.
  if (await getSessionUser()) redirect('/app');

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    const failure = classifyAuthError(error);
    // An unknown code or an unreachable auth server is a bug to know about, not
    // a wrong password to shrug at — the raw error must reach the server log.
    if (isUnexpectedFailure(failure)) {
      console.error('[auth] sign-in failed', { code: error.code, status: error.status, message: error.message });
    }
    return { errors: { form: signInMessageKey(failure) } };
  }

  // The layout's resolveAppEntry routes a signed-in user with no profile to
  // /onboarding, so a returning user lands on /app and a first-run user does not
  // need this action to duplicate the callback's hasProfile branch.
  redirect('/app');
}

/*
 * One message for wrong password, unknown email, and a Google-only user
 * (who has an email but no password). Three distinct messages would let anyone
 * enumerate which emails have accounts; one message reveals nothing.
 */
function signInMessageKey(failure: AuthFailure): string {
  switch (failure) {
    case 'invalid':
      return 'login.errors.invalid';
    case 'unconfirmed':
      return 'login.errors.unconfirmed';
    case 'rateLimited':
      return 'login.errors.rateLimited';
    case 'network':
      return 'error.network';
    default:
      // emailTaken/weakPassword/invalidEmail are signup shapes and cannot occur
      // on sign-in; an unknown code falls through here too.
      return 'error.unexpected';
  }
}

function asString(value: FormDataEntryValue | null): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}
