/**
 * All note data access. Per CLAUDE.md there are no Supabase calls inside
 * components — everything goes through here.
 *
 * Column-grant discipline (supabase/migrations/0007):
 *   insert: owner_id, course_id, slug, title, content_json, content_text, language, visibility
 *   update: course_id, title, content_json, content_text, language, visibility, published_at
 *
 * `slug` is NOT in the UPDATE grant and `updated_at` is trigger-managed —
 * neither may appear in an update object.
 */

import type { NoteDoc } from '@neoformuflash/contracts';
import type { Database } from '@neoformuflash/contracts/db';
import { err, ok, type Result } from '@/lib/result';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/*
 * The empty document: the default when a note is created. ProseMirror needs
 * ≥1 block in the schema, but unionToProse({content:[]}) → [] is valid for
 * the DB default — the editor adds the trailing paragraph at setContent time.
 */
const EMPTY_DOC: NoteDoc = { type: 'doc', content: [] };

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type NoteSummary = {
  id: string;
  title: string;
  contentText: string;
  slug: string;
  updatedAt: string;
};

export type NoteRow = {
  id: string;
  ownerId: string;
  courseId: string | null;
  slug: string;
  title: string;
  contentJson: NoteDoc;
  contentText: string;
  language: string;
  visibility: string;
  sourceNoteId: string | null;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
};

/* ------------------------------------------------------------------ */
/*  Read                                                               */
/* ------------------------------------------------------------------ */

/**
 * A single note, scoped to its owner. Null when the note doesn't exist or
 * belongs to someone else — the caller renders a 404, not an error state.
 */
export async function getNote(
  userId: string,
  id: string,
): Promise<Result<NoteRow | null>> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from('notes')
    .select('*')
    .eq('id', id)
    .eq('owner_id', userId)
    .maybeSingle();

  if (error) return err('error.unexpected', error);
  if (!data) return ok(null);

  return ok({
    id: data.id,
    ownerId: data.owner_id,
    courseId: data.course_id,
    slug: data.slug,
    title: data.title,
    contentJson: data.content_json as unknown as NoteDoc,
    contentText: data.content_text,
    language: data.language,
    visibility: data.visibility,
    sourceNoteId: data.source_note_id,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
    publishedAt: data.published_at,
  });
}

/**
 * All notes the user owns, most recently updated first.
 * Uses the index (notes_owner_updated_idx).
 */
export async function getNotes(userId: string): Promise<Result<NoteSummary[]>> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from('notes')
    .select('id, title, content_text, slug, updated_at')
    .eq('owner_id', userId)
    .order('updated_at', { ascending: false });

  if (error) return err('error.unexpected', error);

  return ok(
    (data ?? []).map((row) => ({
      id: row.id,
      title: row.title,
      contentText: row.content_text,
      slug: row.slug,
      updatedAt: row.updated_at,
    })),
  );
}

/* ------------------------------------------------------------------ */
/*  Create                                                             */
/* ------------------------------------------------------------------ */

const MAX_SLUG_RETRIES = 3;

/**
 * Create a draft note. The slug is generated server-side (CreateNoteInput has
 * no slug field — the DB requires one). On a slug collision the suffix is
 * regenerated, mirroring the `create_profile` retry discipline.
 *
 * Draft safety: visibility is 'public' and published_at is never set, so
 * notes_select_public does not expose the note (it requires
 * published_at IS NOT NULL).
 */
export async function createNoteRow(
  userId: string,
  input: { title: string },
): Promise<Result<{ id: string }>> {
  const supabase = await createSupabaseServerClient();

  const { data: base, error: slugErr } = await supabase.rpc('slugify', {
    p_input: input.title,
  });
  if (slugErr || !base) return err('error.unexpected', slugErr);

  for (let attempt = 0; attempt < MAX_SLUG_RETRIES; attempt++) {
    const suffix = crypto.randomUUID().replace(/-/g, '').slice(0, 8);
    const slug = `${base}-${suffix}`;

    const { data, error } = await supabase
      .from('notes')
      .insert({
        owner_id: userId,
        course_id: null,
        slug,
        title: input.title,
        content_json: EMPTY_DOC as unknown as Database['public']['Tables']['notes']['Insert']['content_json'],
        content_text: '',
        language: 'es',
        visibility: 'public',
      })
      .select('id')
      .single();

    if (error) {
      // 23505 = unique_violation (slug collision)
      if (error.code === '23505' && attempt < MAX_SLUG_RETRIES - 1) continue;
      return err('error.unexpected', error);
    }

    return ok({ id: data.id });
  }

  // Unreachable — the loop always returns.
  return err('error.unexpected');
}

/* ------------------------------------------------------------------ */
/*  Update                                                             */
/* ------------------------------------------------------------------ */

/**
 * Save a note's content. Only the columns in the UPDATE grant are touched:
 * title, content_json, content_text, language. `slug` and `updated_at` are
 * deliberately absent (not in the grant / trigger-managed).
 *
 * Returns the trigger-managed `updated_at` so the client can implement
 * last-write-wins bookkeeping.
 */
export async function updateNoteRow(
  userId: string,
  input: {
    id: string;
    title?: string;
    contentJson?: NoteDoc;
    contentText?: string;
  },
): Promise<Result<{ savedAt: string }>> {
  const supabase = await createSupabaseServerClient();

  const update: Record<string, unknown> = {};
  if (input.title !== undefined) update.title = input.title;
  if (input.contentJson !== undefined) update.content_json = input.contentJson;
  if (input.contentText !== undefined) update.content_text = input.contentText;

  const { data, error } = await supabase
    .from('notes')
    .update(update as unknown as Database['public']['Tables']['notes']['Update'])
    .eq('id', input.id)
    .eq('owner_id', userId)
    .select('updated_at')
    .single();

  if (error) return err('error.unexpected', error);

  return ok({ savedAt: data.updated_at });
}
