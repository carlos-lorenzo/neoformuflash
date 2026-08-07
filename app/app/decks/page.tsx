import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/supabase/session';
import { listDecks, getStreak } from '@/lib/db/decks';
import { DeckList } from '@/components/decks/deck-list';

export default async function DecksPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');

  const t = await getTranslations('decks');
  const [decksResult, streakResult] = await Promise.all([
    listDecks(user.id),
    getStreak(user.id),
  ]);

  if (!decksResult.ok) {
    return <p className="text-ui-base text-danger">{t('error')}</p>;
  }

  return (
    <DeckList
      decks={decksResult.value}
      streak={streakResult.ok ? streakResult.value : null}
    />
  );
}
