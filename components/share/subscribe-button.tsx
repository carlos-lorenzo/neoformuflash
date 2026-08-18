'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { UsersIcon } from '@/components/ui/icon';
import { subscribe, unsubscribe, type SubscribeState } from '@/app/app/share/actions';
import Link from 'next/link';
import type { Route } from 'next';

interface SubscribeButtonProps {
  targetId: string;
  targetType: 'course' | 'deck';
  subscriberCount: number;
  isSubscribed: boolean;
  isOwner: boolean;
  isAuthenticated: boolean;
}

function SubscribeButtonInner({
  targetId,
  targetType,
  subscriberCount,
  isSubscribed,
}: Pick<SubscribeButtonProps, 'targetId' | 'targetType' | 'subscriberCount' | 'isSubscribed'>) {
  const t = useTranslations('publicProfile.share');
  const router = useRouter();

  const initialState: SubscribeState = { targetType, ok: false };
  const [subscribeState, subscribeAction, subscribePending] = useActionState(subscribe, initialState);
  const [unsubscribeState, unsubscribeAction, unsubscribePending] = useActionState(unsubscribe, initialState);

  // Refresh the page when subscribe/unsubscribe completes successfully
  useEffect(() => {
    if (subscribeState.ok === true) {
      router.refresh();
    }
  }, [subscribeState.ok, router]);

  useEffect(() => {
    if (unsubscribeState.ok === true) {
      router.refresh();
    }
  }, [unsubscribeState.ok, router]);

  // Subscribed state: show unsubscribe button
  if (isSubscribed) {
    return (
      <form action={unsubscribeAction}>
        <input type="hidden" name="targetId" value={targetId} />
        <input type="hidden" name="targetType" value={targetType} />
        <Button
          type="submit"
          variant="secondary"
          size="sm"
          className="flex items-center gap-1"
          loading={unsubscribePending}
          loadingLabel={t('unsubscribe')}
        >
          <UsersIcon className="text-tertiary" />
          <span>{t('unsubscribe')}</span>
          <span className="text-ui-xs text-tertiary">{subscriberCount}</span>
        </Button>
      </form>
    );
  }

  // Not subscribed: show subscribe button
  return (
    <form action={subscribeAction}>
      <input type="hidden" name="targetId" value={targetId} />
      <input type="hidden" name="targetType" value={targetType} />
      <Button
        type="submit"
        variant="secondary"
        size="sm"
        className="flex items-center gap-1"
        loading={subscribePending}
        loadingLabel={t('subscribed')}
      >
        <UsersIcon className="text-tertiary" />
        <span>{t('subscribe')}</span>
        <span className="text-ui-xs text-tertiary">{subscriberCount}</span>
      </Button>
    </form>
  );
}

export function SubscribeButton({
  targetId,
  targetType,
  subscriberCount,
  isSubscribed,
  isOwner,
  isAuthenticated,
}: SubscribeButtonProps) {
  const t = useTranslations('publicProfile.share');

  // Owner cannot subscribe to own content
  if (isOwner) return null;

  // Unauthenticated: show sign-in CTA (link to login with redirect)
  if (!isAuthenticated) {
    const loginUrl = `/login?redirect=/${targetType}/${targetId}` as Route;
    return (
      <Link href={loginUrl} className="flex items-center gap-1">
        <Button variant="ghost" size="sm" className="flex items-center gap-1">
          <UsersIcon className="text-tertiary" />
          <span>{t('signInToSubscribe')}</span>
        </Button>
      </Link>
    );
  }

  return (
    <SubscribeButtonInner
      targetId={targetId}
      targetType={targetType}
      subscriberCount={subscriberCount}
      isSubscribed={isSubscribed}
    />
  );
}