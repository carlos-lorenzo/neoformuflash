'use server';

import { getSessionUser } from '@/lib/supabase/session';
import { getNote } from '@/lib/db/notes';
import { getDeck } from '@/lib/db/decks';
import { createCardRow } from '@/lib/db/cards';
import { createDeckRow } from '@/lib/db/decks';
import { getDecryptedKey } from '@/lib/db/ai-keys';
import { notesToCards, validateWithRepair, GeneratedCardArraySchema, type GeneratedCard } from '@/lib/ai/providers';
import { err, ok, type Result } from '@/lib/result';
import { GenerateCardsInput, type NoteDoc } from '@neoformuflash/contracts';
import { extractText } from '@/lib/editor/serialize';

export async function generateCardsAction(
  input: unknown
): Promise<Result<{ deckId: string }>> {
  const user = await getSessionUser();
  if (!user) return err('error.unauthorized');

  const parsed = GenerateCardsInput.safeParse(input);
  if (!parsed.success) return err('onboarding.invalidInput', parsed.error);

  const { noteId, courseId, target, deckId: targetDeckId, provider } = parsed.data;

  // Verify note ownership
  const noteRes = await getNote(user.id, noteId);
  if (!noteRes.ok) return err('content.note.notFound');
  if (!noteRes.value) return err('content.note.notFound');
  if (noteRes.value.ownerId !== user.id) return err('error.unauthorized');

  // Get the decrypted API key
  const keyRes = await getDecryptedKey(user.id, provider);
  if (!keyRes.ok) {
    if (keyRes.code === 'ai.noKey') return err('ai.noKey');
    return err('ai.decryptionFailed');
  }
  const apiKey = keyRes.value;

  // Validate the note has valid content
  const noteDoc = noteRes.value.contentJson;
  if (!noteDoc || noteDoc.type !== 'doc' || !noteDoc.content?.length) {
    return err('ai.emptyNote');
  }

  // Call the provider with validation + repair
  const cardsRes = await validateWithRepair(
    GeneratedCardArraySchema,
    async () => {
      const res = await notesToCards(noteDoc, provider, apiKey);
      return res.cards;
    },
  );

  if (!cardsRes.ok) return err(cardsRes.code, cardsRes.cause);
  const cards: GeneratedCard[] = cardsRes.value;

  let finalDeckId: string;

  if (target === 'new_deck') {
    // Create a new deck
    const deckRes = await createDeckRow(user.id, {
      title: `${noteRes.value.title} — AI Cards`,
      visibility: 'private',
      desiredRetention: null,
      newCardsPerDay: 20,
      courseId,
    });
    if (!deckRes.ok) return err('error.unexpected', deckRes.cause);
    if (!deckRes.value) return err('error.unexpected');
    finalDeckId = deckRes.value.id;
  } else {
    // Verify existing deck ownership
    const deckRes = await getDeck(user.id, targetDeckId!);
    if (!deckRes.ok) return err('content.deck.notFound');
    if (!deckRes.value) return err('content.deck.notFound');
    if (deckRes.value.ownerId !== user.id) return err('error.unauthorized');
    finalDeckId = targetDeckId!;
  }

  // Create all cards
  for (const card of cards) {
    const frontText = extractText(card.frontJson as NoteDoc);
    const backText = extractText(card.backJson as NoteDoc);
    const cardRes = await createCardRow(user.id, {
      deckId: finalDeckId,
      frontJson: card.frontJson as NoteDoc,
      backJson: card.backJson as NoteDoc,
      frontText,
      backText,
      confidence: 'again',
      position: card.position,
    });
    if (!cardRes.ok) return err('error.unexpected', cardRes.cause);
  }

  return ok({ deckId: finalDeckId });
}