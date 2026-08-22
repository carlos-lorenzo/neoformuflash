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
import type { PublicNote, UpdateNoteSeoInput } from '@neoformuflash/contracts';
import { err, ok, type Result } from '@/lib/result';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { checkCourseSubscription } from './courses';

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
 * Get a note for a user who may be the owner OR a subscriber to the course.
 * Used in /app/notes/[id] to allow subscribed users to read course notes.
 * Returns the note if user owns it OR is subscribed to its course.
 */
export async function getNoteForUser(
  userId: string,
  id: string
): Promise<Result<NoteRow | null>> {
  const supabase = await createSupabaseServerClient();

  // First try to get the note as owner
  const { data: ownedNote, error: ownedErr } = await supabase
    .from('notes')
    .select('*')
    .eq('id', id)
    .eq('owner_id', userId)
    .maybeSingle();

  if (ownedErr) return err('error.unexpected', ownedErr);
  if (ownedNote) {
    return ok({
      id: ownedNote.id,
      ownerId: ownedNote.owner_id,
      courseId: ownedNote.course_id,
      slug: ownedNote.slug,
      title: ownedNote.title,
      contentJson: ownedNote.content_json as unknown as NoteDoc,
      contentText: ownedNote.content_text,
      language: ownedNote.language,
      visibility: ownedNote.visibility,
      sourceNoteId: ownedNote.source_note_id,
      createdAt: ownedNote.created_at,
      updatedAt: ownedNote.updated_at,
      publishedAt: ownedNote.published_at,
    });
  }

  // Not owner - check if note belongs to a course user is subscribed to
  const { data: note, error: noteErr } = await supabase
    .from('notes')
    .select('*, course:courses!inner(id)')
    .eq('id', id)
    .maybeSingle();

  if (noteErr) return err('error.unexpected', noteErr);
  if (!note) return ok(null);

  // If note has no course, only owner can access (already checked above)
  if (!note.course_id) return ok(null);

  // Check subscription to the course
  const subResult = await checkCourseSubscription(userId, note.course_id);
  if (!subResult.ok || !subResult.value) return ok(null);

  // User is subscribed to the course - return the note (read-only)
  return ok({
    id: note.id,
    ownerId: note.owner_id,
    courseId: note.course_id,
    slug: note.slug,
    title: note.title,
    contentJson: note.content_json as unknown as NoteDoc,
    contentText: note.content_text,
    language: note.language,
    visibility: note.visibility,
    sourceNoteId: note.source_note_id,
    createdAt: note.created_at,
    updatedAt: note.updated_at,
    publishedAt: note.published_at,
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

/**
 * Public notes under one course, for the public course page.
 * Filters to published public/unlisted notes, matching notes_select_public.
 * Uses a pure anon client to bypass any signed-in session's RLS context.
 */
export async function listPublicCourseNotes(courseId: string): Promise<Result<NoteSummary[]>> {
  const { createSupabaseAnonClient } = await import('@/lib/supabase/server');
  const supabase = createSupabaseAnonClient();

  const { data, error } = await supabase
    .from('notes')
    .select('id, title, content_text, slug, updated_at')
    .eq('course_id', courseId)
    .neq('visibility', 'private')
    .not('published_at', 'is', null) // published_at IS NOT NULL for 'public' notes
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

/**
 * Notes under one course, for the course detail page (phase-03b H). Mirrors
 * getNotes but scoped by course_id. This is the owner's private view — no
 * visibility filter.
 */
export async function listCourseNotes(courseId: string): Promise<Result<NoteSummary[]>> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from('notes')
    .select('id, title, content_text, slug, updated_at')
    .eq('course_id', courseId)
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
  input: { title: string; courseId?: string | null },
): Promise<Result<{ id: string }>> {
  return createNoteRowInternal(userId, {
    title: input.title,
    courseId: input.courseId,
    contentJson: undefined,
    contentText: undefined,
    language: 'es',
    visibility: 'public',
  });
}

/**
 * Create a note with full content (used by AI PDF-to-note flow).
 * Same slug logic as createNoteRow but accepts full content.
 */
export async function createNoteRowWithContent(
  userId: string,
  input: {
    title: string;
    courseId?: string | null;
    contentJson: NoteDoc;
    contentText: string;
    language?: string;
    visibility?: string;
  }
): Promise<Result<{ id: string }>> {
  return createNoteRowInternal(userId, {
    title: input.title,
    courseId: input.courseId,
    contentJson: input.contentJson,
    contentText: input.contentText,
    language: input.language ?? 'en',
    visibility: input.visibility ?? 'private',
  });
}

async function createNoteRowInternal(
  userId: string,
  input: {
    title: string;
    courseId?: string | null;
    contentJson?: NoteDoc;
    contentText?: string;
    language: string;
    visibility: string;
  }
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
        course_id: input.courseId ?? null,
        slug,
        title: input.title,
        content_json: (input.contentJson ?? EMPTY_DOC) as unknown as Database['public']['Tables']['notes']['Insert']['content_json'],
        content_text: input.contentText ?? '',
        language: input.language,
        visibility: input.visibility as Database['public']['Tables']['notes']['Insert']['visibility'],
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
    publishedAt?: string | null;
  },
): Promise<Result<{ savedAt: string }>> {
  const supabase = await createSupabaseServerClient();

  const update: Record<string, unknown> = {};
  if (input.title !== undefined) update.title = input.title;
  if (input.contentJson !== undefined) update.content_json = input.contentJson;
  if (input.contentText !== undefined) update.content_text = input.contentText;
  if (input.publishedAt !== undefined) update.published_at = input.publishedAt;

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

/**
 * Publish or unpublish a note by setting/clearing published_at.
 * Only the owner can do this. Returns 404 if note doesn't exist or isn't owned.
 */
export async function setNotePublished(
  userId: string,
  noteId: string,
  publishedAt: string | null
): Promise<Result<{ savedAt: string }>> {
  return updateNoteRow(userId, { id: noteId, publishedAt });
}

/* ------------------------------------------------------------------ */
/*  Public note access (phase 04)                                     */
/* ------------------------------------------------------------------ */

/**
 * Get a public note by slug. Returns null if the note doesn't exist,
 * is private, unpublished, or under a private/deleted course.
 * This uses the same RLS policy as notes_select_public.
 */
export async function getPublicNoteBySlug(
  handle: string,
  noteSlug: string,
): Promise<Result<PublicNote | null>> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from('notes')
    .select(`
      id, slug, title, content_text, content_json, language,
      og_title, og_description, og_image_url, published_at,
      owner:profiles!notes_owner_id_fkey!inner(handle),
      course:courses(id, slug, name, visibility, deleted_at)
    `)
    .eq('slug', noteSlug)
    // The owner must be embedded to be filtered on — `.eq('profiles.handle')`
    // without the embed is a PGRST108 on every request. The FK is named
    // explicitly because notes↔profiles is ambiguous (owner plus the
    // subscription join), and the embed is !inner so the handle actually
    // constrains the row rather than nulling out.
    .eq('owner.handle', handle)
    .neq('visibility', 'private')
    .not('published_at', 'is', null)
    // Left join, not !inner: a note with no course is still public. An inner
    // join here silently 404s every standalone note.
    .or('visibility.neq.private,visibility.is.null', { referencedTable: 'course' })
    .is('course.deleted_at', null)
    .maybeSingle();

  if (error) return err('error.unexpected', error);
  if (!data) return ok(null);

  const courseInfo = (data.course ?? null) as
    | { id: string; slug: string; name: string; visibility: string; deleted_at: string | null }
    | null;

  return ok({
    id: data.id,
    slug: data.slug,
    title: data.title,
    contentText: data.content_text,
    contentJson: data.content_json as unknown as NoteDoc,
    language: data.language,
    ogTitle: data.og_title,
    ogDescription: data.og_description,
    ogImageUrl: data.og_image_url,
    publishedAt: data.published_at,
    course: courseInfo
      ? {
          id: courseInfo.id,
          slug: courseInfo.slug,
          name: courseInfo.name,
        }
      : null,
  });
}

/**
 * Update a note's SEO metadata (owner only).
 * Validates URL format for ogImageUrl via Zod before calling.
 */
export async function updateNoteSeo(
  userId: string,
  input: UpdateNoteSeoInput,
): Promise<Result<{ savedAt: string }>> {
  const supabase = await createSupabaseServerClient();

  const update: Record<string, unknown> = {};
  if (input.ogTitle !== undefined) update.og_title = input.ogTitle;
  if (input.ogDescription !== undefined) update.og_description = input.ogDescription;
  if (input.ogImageUrl !== undefined) update.og_image_url = input.ogImageUrl;

  if (Object.keys(update).length === 0) {
    const { data } = await supabase
      .from('notes')
      .select('updated_at')
      .eq('id', input.noteId)
      .eq('owner_id', userId)
      .single();
    if (!data) return err('error.unexpected', new Error('Note not found'));
    return ok({ savedAt: data.updated_at });
  }

  const { data, error } = await supabase
    .from('notes')
    .update(update as unknown as Database['public']['Tables']['notes']['Update'])
    .eq('id', input.noteId)
    .eq('owner_id', userId)
    .select('updated_at')
    .single();

  if (error) return err('error.unexpected', error);

  return ok({ savedAt: data.updated_at });
}
