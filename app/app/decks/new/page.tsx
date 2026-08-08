import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/supabase/session';
import { DeckForm } from '@/components/decks/deck-form';

export default async function NewDeckPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');

  const t = await getTranslations('decks');

  return (
    <div className="mx-auto w-full max-w-lg px-4 py-8">
      <h1 className="mb-4 text-ui-lg font-semibold text-primary">{t('createDeck')}</h1>
      <DeckForm />
    </div>
  );
}
