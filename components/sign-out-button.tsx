'use client';

// Client: submits a POST form, which needs no JS but does need the translated label.

import { useTranslations } from 'next-intl';

/*
 * A real form POST rather than a fetch. Sign-out then works even if hydration
 * has not finished, and it cannot be triggered by a prefetch the way a GET link
 * can.
 */
export function SignOutButton() {
  const t = useTranslations('nav');

  return (
    <form action="/auth/sign-out" method="post">
      <button
        type="submit"
        className="duration-instant flex h-11 items-center rounded-md px-3 text-ui-sm text-secondary transition-colors ease-out hover:bg-raised hover:text-primary"
      >
        {t('signOut')}
      </button>
    </form>
  );
}
