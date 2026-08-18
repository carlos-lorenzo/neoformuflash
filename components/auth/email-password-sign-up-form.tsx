'use client';

/*
 * Client: the submit drives a server action through useActionState. Mirrors
 * onboarding-form.tsx — field-keyed catalog errors translated in the UI.
 *
 * `status: 'check-email'` is the hosted-project path: email confirmations are
 * enabled, so signUp created the auth user but returned no session. The form
 * swaps for a confirmation panel — this is success, not an error.
 */

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { signUp, type SignUpState } from '@/app/signup/actions';
import { cn } from '@/lib/cn';

export function EmailPasswordSignUpForm({ className }: { className?: string }) {
  const t = useTranslations();
  const [state, formAction, pending] = useActionState<SignUpState, FormData>(signUp, {
    status: 'idle',
    errors: {},
  });

  /** Translate a catalog key returned by the server action. */
  const message = (key: string | undefined) => (key ? t(key) /* i18n-dynamic-key */ : undefined);

  if (state.status === 'check-email' && state.email) {
    return (
      <div className="mt-6">
        <h2 className="text-ui-lg font-semibold text-primary">{t('signup.checkEmail.title')}</h2>
        <p className="mt-2 text-ui-sm text-secondary">
          {t('signup.checkEmail.body', { email: state.email })}
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className={cn('flex flex-col gap-4', className)}>
      <Input
        name="email"
        type="email"
        label={t('signup.email.label')}
        placeholder={t('signup.email.placeholder')}
        autoComplete="email"
        required
        error={message(state.errors['email'])}
      />

      <Input
        name="password"
        type="password"
        label={t('signup.password.label')}
        autoComplete="new-password"
        required
        error={message(state.errors['password'])}
      />

      <Input
        name="passwordConfirm"
        type="password"
        label={t('signup.passwordConfirm.label')}
        autoComplete="new-password"
        required
        error={message(state.errors['passwordConfirm'])}
      />

      {state.errors['form'] ? (
        <p role="alert" className="text-ui-sm text-danger">
          {message(state.errors['form'])}
        </p>
      ) : null}

      <Button type="submit" variant="primary" loading={pending} className="mt-2 w-full">
        {t('signup.submit')}
      </Button>
    </form>
  );
}
