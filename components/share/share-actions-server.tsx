// Server Component wrapper that fetches subscription status and renders ShareActionsClient

import { checkCourseSubscription } from '@/lib/db/courses';
import { checkDeckSubscription } from '@/lib/db/decks';
import { getSessionUser } from '@/lib/supabase/session';
import { ShareActionsClient } from './share-actions';
import type { PublicCourse, PublicDeck } from '@neoformuflash/contracts';

interface ShareActionsServerProps {
  course?: PublicCourse;
  deck?: PublicDeck;
  isOwner: boolean;
}

export async function ShareActionsServer({
  course,
  deck,
  isOwner,
}: ShareActionsServerProps) {
  const user = await getSessionUser();

  let isSubscribed = false;

  if (user) {
    if (course) {
      const result = await checkCourseSubscription(user.id, course.id);
      isSubscribed = result.ok ? result.value : false;
    } else if (deck) {
      const result = await checkDeckSubscription(user.id, deck.id);
      isSubscribed = result.ok ? result.value : false;
    }
  }

  return (
    <ShareActionsClient
      course={course}
      deck={deck}
      isOwner={isOwner}
      isSubscribed={isSubscribed}
      isAuthenticated={!!user}
    />
  );
}