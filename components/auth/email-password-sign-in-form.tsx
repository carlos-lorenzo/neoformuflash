'use client';

/*
 * Client: the submit drives a server action through useActionState. The form
 * is otherwise static markup; only the pending and error states need the
 * browser. Mirrors onboarding-form.tsx — field-keyed catalog errors translated
 * in the UI, gap-4 between fields, gap-1 label→control.
 */

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { signInWithPassword, type SignInState } from '@/app/login/actions';
import { cn } from '@/lib/cn';

export function EmailPasswordSignInForm({ className }: { className?: string }) {
  const t = useTranslations();
  const [state, formAction, pending] = useActionState<SignInState, FormData>(
    signInWithPassword,
    { errors: {} }
  );

  /** Translate a catalog key returned by the server action. */
  const message = (key: string | undefined) => (key ? t(key) : undefined);

  return (
    <form action={formAction} className={cn('flex flex-col gap-4', className)}>
      <Input
        name="email"
        type="email"
        label={t('login.email.label')}
        placeholder={t('login.email.placeholder')}
        autoComplete="email"
        required
        error={message(state.errors['email'])}
      />

      <Input
        name="password"
        type="password"
        label={t('login.password.label')}
        autoComplete="current-password"
        required
        error={message(state.errors['password'])}
      />

      {state.errors['form'] ? (
        <p role="alert" className="text-ui-sm text-danger">
          {message(state.errors['form'])}
        </p>
      ) : null}

      <Button type="submit" variant="primary" loading={pending} className="mt-2 w-full">
        {t('login.submit')}
      </Button>
    </form>
  );
}
