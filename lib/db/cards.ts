/**
 * Card data access.
 *
 * Column-grant discipline (supabase/migrations/0007 + 0010):
 *   insert: deck_id, front_json, back_json, front_text, back_text, position, complexity, confidence
 *   update: front_json, back_json, front_text, back_text, position, confidence
 *
 * `content_version` is bumped by the 0003 trigger only when front_text or
 * back_text actually changes (ADR-002 decision 8) — never by the client.
 * `updated_at` is trigger-managed.
 * `source_card_id` is set only by fork procedures (security definer).
 */

import type { NoteDoc } from '@neoformuflash/contracts';
import type { UpdateCardInput } from '@neoformuflash/contracts';
import type { Database } from '@neoformuflash/contracts/db';
import { err, ok, type Result } from '@/lib/result';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type CardSummary = {
  id: string;
  frontJson: NoteDoc;
  backJson: NoteDoc;
  frontText: string;
  position: number;
  confidence: string | null;
  contentVersion: number;
};

export type CardRow = {
  id: string;
  deckId: string;
  frontJson: NoteDoc;
  backJson: NoteDoc;
  frontText: string;
  backText: string;
  position: number;
  confidence: string | null;
  contentVersion: number;
};

/* ------------------------------------------------------------------ */
/*  Read                                                               */
/* ------------------------------------------------------------------ */

/**
 * All cards in a deck, for the detail page.
 *
 * `sort`: 'position' (default, the natural order), 'confidence_asc'
 * (again < hard < good < easy, the enum's DB order), or
 * 'confidence_desc' (easy → again). NULLs (unset confidence) sort
 * last in both directions.
 */
export async function listCards(
  deckId: string,
  sort: 'position' | 'confidence_asc' | 'confidence_desc' = 'position',
): Promise<Result<CardSummary[]>> {
  const supabase = await createSupabaseServerClient();

  let orderCol: string;
  let ascending: boolean;
  switch (sort) {
    case 'confidence_asc':
      orderCol = 'confidence';
      ascending = true;
      break;
    case 'confidence_desc':
      orderCol = 'confidence';
      ascending = false;
      break;
    default:
      orderCol = 'position';
      ascending = true;
      break;
  }

  const { data, error } = await supabase
    .from('cards')
    .select('id, front_json, back_json, front_text, position, confidence, content_version')
    .eq('deck_id', deckId)
    .order(orderCol, { ascending, nullsFirst: false });

  if (error) return err('error.unexpected', error);

  return ok(
    (data ?? []).map((row) => ({
      id: row.id,
      frontJson: row.front_json as unknown as NoteDoc,
      backJson: row.back_json as unknown as NoteDoc,
      frontText: row.front_text,
      position: row.position,
      confidence: row.confidence,
      contentVersion: row.content_version,
    })),
  );
}

/**
 * A single card for inline editing. Null when the card doesn't exist or
 * is not visible to the user.
 */
export async function getCard(
  cardId: string,
): Promise<Result<CardRow | null>> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from('cards')
    .select('*')
    .eq('id', cardId)
    .maybeSingle();

  if (error) return err('error.unexpected', error);
  if (!data) return ok(null);

  return ok({
    id: data.id,
    deckId: data.deck_id,
    frontJson: data.front_json as unknown as NoteDoc,
    backJson: data.back_json as unknown as NoteDoc,
    frontText: data.front_text,
    backText: data.back_text,
    position: data.position,
    confidence: data.confidence,
    contentVersion: data.content_version,
  });
}

/* ------------------------------------------------------------------ */
/*  Create                                                             */
/* ------------------------------------------------------------------ */

/**
 * Insert a card. `position` defaults to 0 (the caller computes it as
 * max(position) + 1 if needed, or the editor handles ordering).
 *
 * The 0003 trigger bumps content_version only when front_text or
 * back_text changes — so a new card always starts at version 1
 * (the column default) and an initial save with the defaults does
 * not move it.
 */
export async function createCardRow(
  _userId: string,
  input: {
    deckId: string;
    frontJson: NoteDoc;
    backJson: NoteDoc;
    frontText: string;
    backText: string;
    position: number;
    confidence: Database['public']['Enums']['review_rating'] | null;
  },
): Promise<Result<{ id: string }>> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from('cards')
    .insert({
      deck_id: input.deckId,
      front_json: input.frontJson as unknown as Database['public']['Tables']['cards']['Insert']['front_json'],
      back_json: input.backJson as unknown as Database['public']['Tables']['cards']['Insert']['back_json'],
      front_text: input.frontText,
      back_text: input.backText,
      position: input.position,
      confidence: input.confidence,
    })
    .select('id')
    .single();

  if (error) return err('error.unexpected', error);
  return ok({ id: data.id });
}

/* ------------------------------------------------------------------ */
/*  Update                                                             */
/* ------------------------------------------------------------------ */

/**
 * Update a card. The RLS `cards_update_own` policy scopes this to
 * the deck owner. Returns the trigger-managed content_version so the
 * caller can detect whether front/back text actually changed.
 */
export async function updateCardRow(
  _userId: string,
  input: UpdateCardInput,
): Promise<Result<{ savedAt: string; contentVersion: number }>> {
  const supabase = await createSupabaseServerClient();

  const update: Record<string, unknown> = {};
  if (input.frontJson !== undefined) update.front_json = input.frontJson;
  if (input.backJson !== undefined) update.back_json = input.backJson;
  if (input.frontText !== undefined) update.front_text = input.frontText;
  if (input.backText !== undefined) update.back_text = input.backText;
  if (input.position !== undefined) update.position = input.position;
  if (input.confidence !== undefined) update.confidence = input.confidence;

  if (Object.keys(update).length === 0) {
    const { data } = await supabase
      .from('cards')
      .select('content_version, updated_at')
      .eq('id', input.id)
      .eq('deck_id', input.deckId)
      .single();
    return ok({
      savedAt: data?.updated_at ?? new Date().toISOString(),
      contentVersion: data?.content_version ?? 0,
    });
  }

  const { data, error } = await supabase
    .from('cards')
    .update(update as Database['public']['Tables']['cards']['Update'])
    .eq('id', input.id)
    .eq('deck_id', input.deckId)
    .select('content_version, updated_at')
    .single();

  if (error) return err('error.unexpected', error);

  return ok({
    savedAt: data.updated_at,
    contentVersion: data.content_version,
  });
}

/* ------------------------------------------------------------------ */
/*  Delete                                                             */
/* ------------------------------------------------------------------ */

/**
 * Delete a card. The 0008 BEFORE DELETE trigger blocks this when other
 * users have card_states referencing this card.
 */
export async function deleteCardRow(
  _userId: string,
  cardId: string,
): Promise<Result<void>> {
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase
    .from('cards')
    .delete()
    .eq('id', cardId);

  if (error) {
    if (error.code === 'P0001') return err('card.hasSubscribers');
    return err('error.unexpected', error);
  }

  return ok(undefined);
}
