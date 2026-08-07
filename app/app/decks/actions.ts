'use server';

/**
 * Server actions for deck and card management.
 *
 * Pattern copied from app/app/notes/actions.ts:
 *   - Re-check auth on every call (a stale tab must not bypass the gate)
 *   - Zod validation with catalog-key errors (never prose)
 *   - Delegate persistence to lib/db/* (no Supabase calls here)
 */

import { CreateDeckInput, CardInput, UpdateCardInput } from '@neoformuflash/contracts';
import type { NoteDoc } from '@neoformuflash/contracts';
import type { Route } from 'next';
import { redirect } from 'next/navigation';
import { createDeckRow, updateDeckRow, deleteDeckRow } from '@/lib/db/decks';
import { createCardRow, updateCardRow, deleteCardRow } from '@/lib/db/cards';
import { getSessionUser } from '@/lib/supabase/session';

/* ------------------------------------------------------------------ */
/*  Create deck                                                        */
/* ------------------------------------------------------------------ */

export type CreateDeckState = {
  errors: Record<string, string>;
};

/**
 * Create a draft deck and redirect into its detail page.
 * Called from a `useActionState` form — the title comes from a hidden input.
 */
export async function createDeck(
  _previous: CreateDeckState,
  formData: FormData,
): Promise<CreateDeckState> {
  const user = await getSessionUser();
  if (!user) redirect('/login');

  const rawTitle = formData.get('title');
  const titleValue = typeof rawTitle === 'string' ? rawTitle.trim() : '';
  const title = titleValue || 'Untitled deck';

  const parsed = CreateDeckInput.pick({ title: true }).safeParse({ title });
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0];
      if (typeof field === 'string' && !errors[field]) errors[field] = issue.message;
    }
    return { errors };
  }

  const result = await createDeckRow(user.id, {
    title: parsed.data.title,
    visibility: 'public',
    desiredRetention: null,
    newCardsPerDay: 20,
  });

  if (!result.ok) return { errors: { form: result.code } };

  redirect(`/app/decks/${result.value.id}` as Route);
}

/* ------------------------------------------------------------------ */
/*  Create / update / delete deck                                      */
/* ------------------------------------------------------------------ */

export type DeckFormState = {
  savedAt?: string;
  errors?: Record<string, string>;
};

export async function saveDeck(
  _previous: DeckFormState,
  formData: FormData,
): Promise<DeckFormState> {
  const user = await getSessionUser();
  if (!user) return { errors: { form: 'error.unexpected' } };

  const id = formData.get('id');
  if (typeof id !== 'string' || !id) return { errors: { form: 'content.deck.invalid' } };

  const rawTitle = formData.get('title');
  const rawVisibility = formData.get('visibility');
  const rawRetention = formData.get('desiredRetention');
  const rawNewPerDay = formData.get('newCardsPerDay');

  const parsed = CreateDeckInput.partial().safeParse({
    title: typeof rawTitle === 'string' ? rawTitle : undefined,
    visibility: typeof rawVisibility === 'string' ? rawVisibility : undefined,
    desiredRetention:
      typeof rawRetention === 'string' && rawRetention !== ''
        ? Number(rawRetention)
        : null,
    newCardsPerDay:
      typeof rawNewPerDay === 'string' && rawNewPerDay !== ''
        ? Number(rawNewPerDay)
        : undefined,
  });
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0];
      if (typeof field === 'string' && !errors[field]) errors[field] = issue.message;
    }
    return { errors };
  }

  const result = await updateDeckRow(user.id, { id, ...parsed.data });
  if (!result.ok) return { errors: { form: result.code } };
  return { savedAt: result.value.savedAt };
}

export async function deleteDeck(input: { id: string }): Promise<{ errors?: Record<string, string> }> {
  const user = await getSessionUser();
  if (!user) return { errors: { form: 'error.unexpected' } };

  const result = await deleteDeckRow(user.id, input.id);
  if (!result.ok) return { errors: { form: result.code } };
  return {};
}

/* ------------------------------------------------------------------ */
/*  Cards                                                              */
/* ------------------------------------------------------------------ */

export async function createCard(input: {
  deckId: string;
  frontJson: NoteDoc;
  backJson: NoteDoc;
  frontText: string;
  backText: string;
  position: number;
  confidence: 'again' | 'hard' | 'good' | 'easy' | null;
}): Promise<{ id?: string; errors?: Record<string, string> }> {
  const user = await getSessionUser();
  if (!user) return { errors: { form: 'error.unexpected' } };

  const parsed = CardInput.safeParse(input);
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0];
      if (typeof field === 'string' && !errors[field]) errors[field] = issue.message;
    }
    return { errors };
  }

  const result = await createCardRow(user.id, parsed.data);
  if (!result.ok) return { errors: { form: result.code } };
  return { id: result.value.id };
}

export async function updateCard(
  input: UpdateCardInput,
): Promise<{ savedAt?: string; contentVersion?: number; errors?: Record<string, string> }> {
  const user = await getSessionUser();
  if (!user) return { errors: { form: 'error.unexpected' } };

  const parsed = UpdateCardInput.safeParse(input);
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0];
      if (typeof field === 'string' && !errors[field]) errors[field] = issue.message;
    }
    return { errors };
  }

  const result = await updateCardRow(user.id, parsed.data);
  if (!result.ok) return { errors: { form: result.code } };
  return { savedAt: result.value.savedAt, contentVersion: result.value.contentVersion };
}

export async function deleteCard(input: { id: string }): Promise<{ errors?: Record<string, string> }> {
  const user = await getSessionUser();
  if (!user) return { errors: { form: 'error.unexpected' } };

  const result = await deleteCardRow(user.id, input.id);
  if (!result.ok) return { errors: { form: result.code } };
  return {};
}
