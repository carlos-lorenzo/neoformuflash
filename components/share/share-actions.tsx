'use client';

import type { PublicCourse, PublicDeck } from '@neoformuflash/contracts';
import { SubscribeButton } from './subscribe-button';
import { ForkButton } from './fork-button';

interface ShareActionsClientProps {
  course?: PublicCourse;
  deck?: PublicDeck;
  isOwner: boolean;
  isSubscribed: boolean;
  isAuthenticated: boolean;
}

export function ShareActionsClient({
  course,
  deck,
  isOwner,
  isSubscribed,
  isAuthenticated,
}: ShareActionsClientProps) {
  const targetType = course ? 'course' : 'deck';
  const targetId = course?.id ?? deck?.id;
  const subscriberCount = course?.subscriberCount ?? deck?.subscriberCount ?? 0;
  const forkCount = course?.forkCount ?? deck?.forkCount ?? 0;

  if (!targetId) return null;

  return (
    <div className="flex items-center gap-2">
      <SubscribeButton
        targetId={targetId}
        targetType={targetType}
        subscriberCount={subscriberCount}
        isSubscribed={isSubscribed}
        isOwner={isOwner}
        isAuthenticated={isAuthenticated}
      />
      <ForkButton
        targetId={targetId}
        targetType={targetType}
        forkCount={forkCount}
        isOwner={isOwner}
        isAuthenticated={isAuthenticated}
      />
    </div>
  );
}