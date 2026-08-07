'use server';

import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getSessionUser } from '@/lib/supabase/session';

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
    return { errors: { form: mapSignInError(error.code) } };
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
function mapSignInError(code: string | undefined): string {
  switch (code) {
    case 'invalid_credentials':
      return 'login.errors.invalid';
    case 'email_not_confirmed':
      return 'login.errors.unconfirmed';
    case 'over_request_rate_limit':
    case 'over_email_send_rate_limit':
      return 'login.errors.rateLimited';
    default:
      return 'error.unexpected';
  }
}

function asString(value: FormDataEntryValue | null): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}
