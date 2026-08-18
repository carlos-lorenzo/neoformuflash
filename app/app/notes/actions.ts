'use server';

/**
 * Server actions for note creation and autosave.
 *
 * Pattern copied from app/onboarding/actions.ts:
 *   - Re-check auth on every call (a stale tab must not bypass the gate)
 *   - Zod validation with catalog-key errors (never prose)
 *   - Re-validate content server-side (proseToUnion is the trust boundary)
 *   - Recompute contentText from the validated union (AC8)
 */

import { CreateNoteInput, UpdateNoteInput, type NoteDoc } from '@neoformuflash/contracts';
import { extractText } from '@neoformuflash/contracts';
import type { Route } from 'next';
import { redirect } from 'next/navigation';
import { createNoteRow, updateNoteRow } from '@/lib/db/notes';
import { proseToUnion } from '@/lib/editor/serialize';
import { deriveTitle } from '@/lib/editor/derive-title';
import { getSessionUser } from '@/lib/supabase/session';

/* ------------------------------------------------------------------ */
/*  Create note                                                        */
/* ------------------------------------------------------------------ */

export type CreateNoteState = {
  errors: Record<string, string>;
};

/**
 * Create a draft note inside a course and redirect into its editor.
 * Called from a `useActionState` form — the title comes from a hidden input
 * or defaults to "Untitled".
 *
 * `courseId` is required (phase-03c): notes are created from a course detail
 * page, so a create without one is a caller bug rather than a standalone note.
 * The column stays nullable at the DB level — this is a UX invariant enforced
 * at the entry point, not a schema change.
 */
export async function createNote(
  _previous: CreateNoteState,
  formData: FormData,
): Promise<CreateNoteState> {
  const user = await getSessionUser();
  if (!user) redirect('/login');

  const rawTitle = formData.get('title');
  const titleValue = typeof rawTitle === 'string' ? rawTitle.trim() : '';
  // The spec's empty-state copy is "Your first note starts here" — an empty
  // title is normal and defaults to "Untitled".
  const title = titleValue || 'Untitled';

  const rawCourseId = formData.get('courseId');

  const parsed = CreateNoteInput.pick({ title: true })
    .extend({ courseId: CreateNoteInput.shape.courseId.unwrap() })
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

  const result = await createNoteRow(user.id, {
    title: parsed.data.title,
    courseId: parsed.data.courseId,
  });
  if (!result.ok) return { errors: { form: result.code } };

  redirect(`/app/notes/${result.value.id}` as Route);
}

/* ------------------------------------------------------------------ */
/*  Save note (autosave)                                               */
/* ------------------------------------------------------------------ */

export type SaveNoteState = {
  savedAt?: string;
  errors?: Record<string, string>;
};

/**
 * Persist a note's content. The client sends editor.getJSON() as contentJson;
 * the server re-validates via proseToUnion and recomputes contentText.
 *
 * Returns the trigger-managed `updated_at` as `savedAt` for last-write-wins
 * bookkeeping. Two-tab conflict handling is deferred to a later phase.
 */
export async function saveNote(input: {
  id: string;
  title?: string;
  contentJson?: unknown;
}): Promise<SaveNoteState> {
  const user = await getSessionUser();
  if (!user) return { errors: { form: 'error.unexpected' } };

  const parsed = UpdateNoteInput.safeParse(input);
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0];
      if (typeof field === 'string' && !errors[field]) errors[field] = issue.message;
    }
    return { errors };
  }

  // Re-validate content server-side — the client's JSON is untrusted.
  let contentJson: NoteDoc | undefined;
  let contentText: string | undefined;

  if (parsed.data.contentJson) {
    const union = proseToUnion(parsed.data.contentJson);
    if (!union.ok) return { errors: { form: union.code } };
    contentJson = union.value;
    contentText = extractText(union.value);
  }

  // Derive title from content if not explicitly provided (or if it's the "Untitled" default).
  // This is the server-side trust boundary for title — matches the client-side deriveTitle logic.
  let title = parsed.data.title;
  if (contentJson && (!title || title === 'Untitled')) {
    title = deriveTitle(contentJson);
  }

  const result = await updateNoteRow(user.id, {
    id: parsed.data.id,
    title,
    contentJson,
    contentText,
  });

  if (!result.ok) return { errors: { form: result.code } };

  return { savedAt: result.value.savedAt };
}
