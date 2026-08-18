'use client';

import { useState, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { CodeForkIcon } from '@/components/ui/icon';
import { fork, type ForkState } from '@/app/app/share/actions';
import { ForkConfirmDialog } from './fork-confirm-dialog';
import Link from 'next/link';
import type { Route } from 'next';

interface ForkButtonProps {
  targetId: string;
  targetType: 'course' | 'deck';
  forkCount: number;
  isOwner: boolean;
  isAuthenticated: boolean;
}

function ForkButtonInner({
  targetId,
  targetType,
  forkCount,
}: Pick<ForkButtonProps, 'targetId' | 'targetType' | 'forkCount'>) {
  const t = useTranslations('publicProfile.share');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const initialState: ForkState = { targetType, ok: false };
  const [state, formAction, forkPending] = useActionState(fork, initialState);

  const isLoading = forkPending;

  const handleConfirm = () => {
    formRef.current?.requestSubmit();
  };

  return (
    <>
      <form ref={formRef} action={formAction}>
        <input type="hidden" name="targetId" value={targetId} />
        <input type="hidden" name="targetType" value={targetType} />
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="flex items-center gap-1"
          onClick={() => setConfirmOpen(true)}
        >
          <CodeForkIcon className="text-tertiary" />
          <span>{t('fork')}</span>
          <span className="text-ui-xs text-tertiary">{forkCount}</span>
        </Button>
      </form>

      <ForkConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        onConfirm={handleConfirm}
        targetType={targetType}
        statesCarried={state.result?.statesCarried}
        loading={isLoading}
      />
    </>
  );
}

export function ForkButton({
  targetId,
  targetType,
  forkCount,
  isOwner,
  isAuthenticated,
}: ForkButtonProps) {
  const t = useTranslations('publicProfile.share');

  // Owner cannot fork own content
  if (isOwner) return null;

  // Unauthenticated: show sign-in CTA (link to login with redirect)
  if (!isAuthenticated) {
    const loginUrl = `/login?redirect=/${targetType}/${targetId}` as Route;
    return (
      <Link href={loginUrl} className="flex items-center gap-1">
        <Button variant="ghost" size="sm" className="flex items-center gap-1">
          <CodeForkIcon className="text-tertiary" />
          <span>{t('signInToFork')}</span>
        </Button>
      </Link>
    );
  }

  return (
    <ForkButtonInner
      targetId={targetId}
      targetType={targetType}
      forkCount={forkCount}
    />
  );
}