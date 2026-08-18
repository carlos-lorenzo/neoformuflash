'use server';

/**
 * Server actions for deck and card management.
 *
 * Pattern copied from app/app/notes/actions.ts:
 *   - Re-check auth on every call (a stale tab must not bypass the gate)
 *   - Zod validation with catalog-key errors (never prose)
 *   - Delegate persistence to lib/db/* (no Supabase calls here)
 */

import { CreateDeckInput, CardInput, UpdateCardInput, extractText } from '@neoformuflash/contracts';
import type { NoteDoc } from '@neoformuflash/contracts';
import type { Route } from 'next';
import { redirect } from 'next/navigation';
import { createDeckRow, updateDeckRow, deleteDeckRow } from '@/lib/db/decks';
import { createCardRow, updateCardRow, deleteCardRow } from '@/lib/db/cards';
import { proseToUnion } from '@/lib/editor/serialize';
import { getSessionUser } from '@/lib/supabase/session';

/*
 * Client JSON is untrusted: the CardInput schema accepts `frontJson`/`backJson`
 * as `z.custom<NoteDoc>()` which validates nothing. Re-run proseToUnion (the
 * save-time trust boundary) and recompute front_text/back_text from the
 * validated union — the client-supplied text is discarded, so a client cannot
 * forge the change signal every subscriber's "this card changed" flag depends
 * on (phase-03b D3). Same convention as saveNote in notes/actions.ts.
 */
function revalidateContent(json: unknown): { ok: true; json: NoteDoc; text: string } | { ok: false; code: string } {
  const union = proseToUnion(json);
  if (!union.ok) return { ok: false, code: union.code };
  return { ok: true, json: union.value, text: extractText(union.value) };
}

/* ------------------------------------------------------------------ */
/*  Create deck                                                        */
/* ------------------------------------------------------------------ */

export type CreateDeckState = {
  errors: Record<string, string>;
};

/**
 * Create a draft deck inside a course and redirect into its detail page.
 * Called from a `useActionState` form — the title comes from a hidden input.
 *
 * `courseId` is required (phase-03c): every deck is created from a course
 * detail page, so a create without one is a bug in the caller, not a standalone
 * deck. The column stays nullable at the DB level — this is a UX invariant
 * enforced at the entry point, not a schema change.
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

  const rawCourseId = formData.get('courseId');

  const parsed = CreateDeckInput.pick({ title: true })
    .extend({ courseId: CreateDeckInput.shape.courseId.unwrap() })
    .safeParse({
      title,
      courseId: typeof rawCourseId === 'string' ? rawCourseId : undefined,
    });
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
    courseId: parsed.data.courseId,
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

export async function deleteDeck(input: { id: string }): Promise<{ courseId?: string; errors?: Record<string, string> }> {
  const user = await getSessionUser();
  if (!user) return { errors: { form: 'error.unexpected' } };

  // Get the deck first to read its courseId for the redirect.
  const { getDeck } = await import('@/lib/db/decks');
  const deckResult = await getDeck(user.id, input.id);
  if (!deckResult.ok || !deckResult.value) return { errors: { form: 'error.unexpected' } };

  const result = await deleteDeckRow(user.id, input.id);
  if (!result.ok) return { errors: { form: result.code } };
  return { courseId: deckResult.value.courseId ?? undefined };
}

/* ------------------------------------------------------------------ */
/*  Cards                                                              */
/* ------------------------------------------------------------------ */

export async function createCard(input: {
  deckId: string;
  frontJson: NoteDoc;
  backJson: NoteDoc;
  confidence: 'again' | 'hard' | 'good' | 'easy' | null;
}): Promise<{ id?: string; errors?: Record<string, string> }> {
  const user = await getSessionUser();
  if (!user) return { errors: { form: 'error.unexpected' } };

  // Parse without the text/position fields: frontText/backText are recomputed
  // server-side (D3) and position is computed inside createCardRow (max+1).
  const parsed = CardInput.omit({ frontText: true, backText: true, position: true }).safeParse(input);
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0];
      if (typeof field === 'string' && !errors[field]) errors[field] = issue.message;
    }
    return { errors };
  }

  // Re-validate card content server-side — the client JSON is untrusted and
  // the client-supplied text is discarded (D3).
  const front = revalidateContent(parsed.data.frontJson);
  if (!front.ok) return { errors: { form: front.code } };
  const back = revalidateContent(parsed.data.backJson);
  if (!back.ok) return { errors: { form: back.code } };

  const result = await createCardRow(user.id, {
    deckId: parsed.data.deckId,
    frontJson: front.json,
    backJson: back.json,
    frontText: front.text,
    backText: back.text,
    confidence: parsed.data.confidence,
  });
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

  // Re-validate server-side (D3): client frontJson/backJson are untrusted, and
  // the client-supplied text is discarded in favour of extractText of the
  // validated union.
  const { frontJson, backJson, frontText, backText, ...rest } = parsed.data;
  let front: ReturnType<typeof revalidateContent> | undefined;
  let back: ReturnType<typeof revalidateContent> | undefined;
  if (frontJson !== undefined) {
    front = revalidateContent(frontJson);
    if (!front.ok) return { errors: { form: front.code } };
  }
  if (backJson !== undefined) {
    back = revalidateContent(backJson);
    if (!back.ok) return { errors: { form: back.code } };
  }

  const result = await updateCardRow(user.id, {
    ...rest,
    frontJson: front?.ok ? front.json : frontJson,
    backJson: back?.ok ? back.json : backJson,
    frontText: front?.ok ? front.text : frontText,
    backText: back?.ok ? back.text : backText,
  } as UpdateCardInput);
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
