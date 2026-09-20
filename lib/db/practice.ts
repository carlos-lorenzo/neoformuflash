/**
 * Practice mode data access — study without affecting FSRS scheduling.
 *
 * Invariants (the whole point of this file):
 *   - NEVER reads card_states for queueing (no due filter, no daily cap).
 *   - NEVER writes card_states or review_logs. The FSRS optimizer reads
 *     review_logs; a practice grade must not pollute it.
 *   - Practice history goes to practice_logs (append-only). The
 *     practice_logs_bump_streak trigger keeps the streak counting.
 *
 * Queue = all cards in the deck (position order, or shuffled), optionally
 * narrowed by the pre-session filter menu (confidence + include/exclude).
 */

import type { NoteDoc } from '@neoformuflash/contracts';
import type { Database } from '@neoformuflash/contracts/db';
import { err, ok, type Result } from '@/lib/result';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getStreak, type Streak } from './decks';

export type PracticeConfidence = Database['public']['Tables']['cards']['Row']['confidence'];

export type PracticeFilter = {
  /** Confidence values to include. Omit/empty = all. Includes a `null` entry to keep unset-confidence cards. */
  confidences?: (PracticeConfidence | null)[];
  /** Card ids to hide for this session (the per-card exclude toggles). */
  excludeIds?: string[];
  /** When set, only these cards are practiced (the include-only selection). */
  includeOnlyIds?: string[];
  shuffle?: boolean;
  limit?: number;
};

export type PracticeCard = {
  id: string;
  frontJson: NoteDoc;
  backJson: NoteDoc;
  contentVersion: number;
  confidence: PracticeConfidence;
};

export type StartPracticeResult = {
  deck: { id: string; title: string };
  cards: PracticeCard[];
  totalInDeck: number;
  streak: Streak | null;
};

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 200;

function shuffleInPlace<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j] as T, arr[i] as T];
  }
  return arr;
}

export async function startPractice(
  userId: string,
  deckId: string,
  filter: PracticeFilter = {},
): Promise<Result<StartPracticeResult>> {
  const supabase = await createSupabaseServerClient();

  const { data: deck, error: deckErr } = await supabase
    .from('decks')
    .select('id, title')
    .eq('id', deckId)
    .maybeSingle();

  if (deckErr) return err('error.unexpected', deckErr);
  if (!deck) return err('deck.notFound');

  const { data: rows, error: cardsErr } = await supabase
    .from('cards')
    .select('id, front_json, back_json, content_version, confidence')
    .eq('deck_id', deckId)
    .order('position', { ascending: true })
    .order('created_at', { ascending: true })
    .limit(2000);

  if (cardsErr) return err('error.unexpected', cardsErr);

  const totalInDeck = (rows ?? []).length;

  const exclude = new Set(filter.excludeIds ?? []);
  const includeOnly = filter.includeOnlyIds ? new Set(filter.includeOnlyIds) : null;
  const confidences = filter.confidences;

  let cards: PracticeCard[] = (rows ?? [])
    .filter((r) => !exclude.has(r.id))
    .filter((r) => (includeOnly ? includeOnly.has(r.id) : true))
    .filter((r) =>
      confidences && confidences.length > 0
        ? (confidences as (string | null)[]).includes(r.confidence)
        : true,
    )
    .map((r) => ({
      id: r.id,
      frontJson: r.front_json as unknown as NoteDoc,
      backJson: r.back_json as unknown as NoteDoc,
      contentVersion: r.content_version,
      confidence: r.confidence as PracticeConfidence,
    }));

  if (filter.shuffle) shuffleInPlace(cards);

  const limit = Math.min(Math.max(filter.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
  cards = cards.slice(0, limit);

  const streak = await getStreak(userId);
  return ok({
    deck: { id: deck.id, title: deck.title },
    cards,
    totalInDeck,
    streak: streak.ok ? streak.value : null,
  });
}

export async function logPractice(
  userId: string,
  input: { cardId: string; rating: Database['public']['Enums']['review_rating'] },
): Promise<Result<{ streak: Streak | null }>> {
  const supabase = await createSupabaseServerClient();

  // Visibility check through RLS: the card must be selectable by this user.
  const { data: card } = await supabase
    .from('cards')
    .select('id')
    .eq('id', input.cardId)
    .maybeSingle();
  if (!card) return err('card.notFound');

  const { error } = await supabase.from('practice_logs').insert({
    user_id: userId,
    card_id: input.cardId,
    rating: input.rating,
  });
  if (error) return err('error.unexpected', error);

  // practice_logs_bump_streak fired inside the insert transaction.
  const streak = await getStreak(userId);
  return ok({ streak: streak.ok ? streak.value : null });
}
