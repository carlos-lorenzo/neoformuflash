/**
 * Course data access.
 *
 * Column-grant discipline (supabase/migrations/0007):
 *   insert: owner_id, slug, name, code, language, visibility, institution_id, degree_id
 *   update: name, code, language, visibility, institution_id, degree_id
 *
 * `slug` is NOT in the UPDATE grant (decision 6: immutable after first publish).
 *
 * Deletion is delete_course() (0011, ADR-002 decision 11): a hard delete that
 * auto-forks every subscriber holding progress before removing the course.
 * A direct owner DELETE on the table is legal (0011 grant) but skips the
 * auto-fork — the app must go through the RPC. `deleted_at` is left in place
 * but unused (0011 §4); a later phase must not build a soft-delete path beside
 * the hard one.
 *
 * Phase 03b lights up a table that has been 100% dormant since 0003 — the
 * schema, RLS policies and grants were built then and never exercised.
 */

import type { Database } from '@neoformuflash/contracts/db';
import { err, ok, type Result } from '@/lib/result';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type CourseSummary = {
  id: string;
  name: string;
  code: string | null;
  slug: string;
  language: string;
  visibility: Database['public']['Enums']['visibility'];
  createdAt: string;
};

export type CourseRow = CourseSummary & {
  ownerId: string;
  subscriberCount: number;
  forkCount: number;
};

/**
 * CourseRow with subscription/ownership context for the current user.
 * Used in UI to conditionally render owner vs subscriber actions.
 */
export type CourseWithSubscription = CourseRow & {
  isOwner: boolean;
  isSubscribed: boolean;
};

/*
 * The enforce_private_requires_pro trigger (0003) raises with no errcode, so
 * Postgres assigns generic P0001 — which decks.ts and cards.ts already map to
 * "has subscribers". For courses the only P0001 source is that trigger, so we
 * disambiguate by message rather than claiming P0001 wholesale (H7). A follow-up
 * migration can give the trigger a real errcode; until then this is the seam.
 */
const PRIVATE_REQUIRES_PRO_MSG = 'private visibility requires an active subscription';

function courseError(error: { code: string; message: string }): string {
  if (error.code === 'P0001' && error.message.includes(PRIVATE_REQUIRES_PRO_MSG)) {
    return 'course.privateRequiresPro';
  }
  return 'error.unexpected';
}

const COURSE_SELECT = 'id, owner_id, slug, name, code, language, visibility, subscriber_count, fork_count, created_at';

function toRow(row: Record<string, unknown>): CourseRow {
  return {
    id: row.id as string,
    ownerId: row.owner_id as string,
    slug: row.slug as string,
    name: row.name as string,
    code: (row.code as string | null) ?? null,
    language: row.language as string,
    visibility: row.visibility as CourseRow['visibility'],
    subscriberCount: row.subscriber_count as number,
    forkCount: row.fork_count as number,
    createdAt: row.created_at as string,
  };
}

/* ------------------------------------------------------------------ */
/*  Read                                                               */
/* ------------------------------------------------------------------ */

/**
 * Get a public course by owner handle and course slug.
 * Returns null if the course doesn't exist, is private, or deleted.
 * Used by the public course page at /@handle/courses/course-slug.
 */
export async function getPublicCourseBySlug(
  handle: string,
  courseSlug: string
): Promise<Result<CourseRow | null>> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from('courses')
    .select(`
      id, owner_id, slug, name, code, language, visibility, subscriber_count, fork_count, created_at,
      owner:profiles!courses_owner_id_fkey!inner(handle)
    `)
    .eq('slug', courseSlug)
    .eq('owner.handle', handle)
    .neq('visibility', 'private')
    .is('deleted_at', null)
    .maybeSingle();

  if (error) return err('error.unexpected', error);
  if (!data) return ok(null);

  return ok(toRow(data));
}

/**
 * Get a public course by owner handle and course slug, returning a PublicCourse shape.
 * Includes ownerId for ownership checks on public pages.
 */
export async function getPublicCourseBySlugPublic(
  handle: string,
  courseSlug: string
): Promise<Result<{ id: string; slug: string; name: string; code: string | null; subscriberCount: number; forkCount: number; ownerId: string } | null>> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from('courses')
    .select(`
      id, owner_id, slug, name, code, subscriber_count, fork_count,
      owner:profiles!courses_owner_id_fkey!inner(handle)
    `)
    .eq('slug', courseSlug)
    .eq('owner.handle', handle)
    .neq('visibility', 'private')
    .is('deleted_at', null)
    .maybeSingle();

  if (error) return err('error.unexpected', error);
  if (!data) return ok(null);

  return ok({
    id: data.id,
    ownerId: data.owner_id,
    slug: data.slug,
    name: data.name,
    code: data.code,
    subscriberCount: data.subscriber_count,
    forkCount: data.fork_count,
  });
}

/**
 * All courses the user can see (owned + subscribed).
 * Ordered by most recent first; a fresh course lands at the top.
 */
export async function listCourses(userId: string): Promise<Result<CourseSummary[]>> {
  const supabase = await createSupabaseServerClient();

  // 1. Owned courses
  const { data: owned, error: ownedErr } = await supabase
    .from('courses')
    .select(COURSE_SELECT)
    .eq('owner_id', userId)
    .order('created_at', { ascending: false });

  if (ownedErr) return err('error.unexpected', ownedErr);

  // 2. Subscribed courses (user does not own them)
  const { data: subRow, error: subErr } = await supabase
    .from('course_subscriptions')
    .select('course_id')
    .eq('user_id', userId);

  if (subErr) return err('error.unexpected', subErr);

  const subCourseIds = (subRow ?? []).map((r) => r.course_id);
  if (subCourseIds.length === 0 && (owned ?? []).length === 0) return ok([]);

  let subscribed: typeof owned = [];
  if (subCourseIds.length > 0) {
    const { data, error } = await supabase
      .from('courses')
      .select(COURSE_SELECT)
      .in('id', subCourseIds)
      .order('created_at', { ascending: false });
    if (error) return err('error.unexpected', error);
    subscribed = data;
  }

  // Deduplicate while preserving order (owned first, then subscribed)
  const seen = new Set<string>();
  const deduped = [...(owned ?? []), ...(subscribed ?? [])].filter((c) => {
    if (seen.has(c.id)) return false;
    seen.add(c.id);
    return true;
  });

  return ok(
    deduped.map((row) => {
      const full = toRow(row);
      return {
        id: full.id,
        name: full.name,
        code: full.code,
        slug: full.slug,
        language: full.language,
        visibility: full.visibility,
        createdAt: full.createdAt,
      };
    }),
  );
}

/**
 * All courses the user can see (owned + subscribed) WITH subscription status.
 * Ordered by most recent first; a fresh course lands at the top.
 * Returns CourseSummary with isOwner/isSubscribed flags for UI indicators.
 */
export async function listCoursesWithSubscription(userId: string): Promise<Result<(CourseSummary & { isOwner: boolean; isSubscribed: boolean })[]>> {
  const supabase = await createSupabaseServerClient();

  // 1. Owned courses
  const { data: owned, error: ownedErr } = await supabase
    .from('courses')
    .select(COURSE_SELECT)
    .eq('owner_id', userId)
    .order('created_at', { ascending: false });

  if (ownedErr) return err('error.unexpected', ownedErr);

  // 2. Subscribed courses (user does not own them)
  const { data: subRow, error: subErr } = await supabase
    .from('course_subscriptions')
    .select('course_id')
    .eq('user_id', userId);

  if (subErr) return err('error.unexpected', subErr);

  const subCourseIds = (subRow ?? []).map((r) => r.course_id);
  if (subCourseIds.length === 0 && (owned ?? []).length === 0) return ok([]);

  let subscribed: typeof owned = [];
  if (subCourseIds.length > 0) {
    const { data, error } = await supabase
      .from('courses')
      .select(COURSE_SELECT)
      .in('id', subCourseIds)
      .order('created_at', { ascending: false });
    if (error) return err('error.unexpected', error);
    subscribed = data;
  }

  // Deduplicate while preserving order (owned first, then subscribed)
  const seen = new Set<string>();
  const deduped = [...(owned ?? []), ...(subscribed ?? [])].filter((c) => {
    if (seen.has(c.id)) return false;
    seen.add(c.id);
    return true;
  });

  // Build a set of subscribed course IDs for quick lookup
  const subscribedIdSet = new Set(subCourseIds);

  return ok(
    deduped.map((row) => {
      const full = toRow(row);
      const isOwner = full.ownerId === userId;
      const isSubscribed = !isOwner && subscribedIdSet.has(full.id);
      return {
        id: full.id,
        name: full.name,
        code: full.code,
        slug: full.slug,
        language: full.language,
        visibility: full.visibility,
        createdAt: full.createdAt,
        isOwner,
        isSubscribed,
      };
    }),
  );
}

/**
 * A single course. Null when it doesn't exist or isn't visible to the user.
 * This is the basic version without subscription context (used for public pages).
 */
export async function getCourse(courseId: string): Promise<Result<CourseRow | null>> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from('courses')
    .select(COURSE_SELECT)
    .eq('id', courseId)
    .maybeSingle();

  if (error) return err('error.unexpected', error);
  if (!data) return ok(null);
  return ok(toRow(data));
}

/**
 * Get a course with ownership and subscription status for a specific user.
 * Used in /app/courses/[id] to determine what UI to show.
 */
export async function getCourseForUser(
  userId: string,
  courseId: string
): Promise<Result<CourseWithSubscription | null>> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from('courses')
    .select(COURSE_SELECT)
    .eq('id', courseId)
    .maybeSingle();

  if (error) return err('error.unexpected', error);
  if (!data) return ok(null);

  const course = toRow(data);
  const isOwner = course.ownerId === userId;

  // Check subscription if not owner
  let isSubscribed = false;
  if (!isOwner) {
    const { data: subData } = await supabase
      .from('course_subscriptions')
      .select('user_id')
      .eq('course_id', courseId)
      .eq('user_id', userId)
      .maybeSingle();
    isSubscribed = !!subData;
  }

  return ok({
    ...course,
    isOwner,
    isSubscribed,
  });
}

/* ------------------------------------------------------------------ */
/*  Create                                                             */
/* ------------------------------------------------------------------ */

/**
 * Create a course. Slug follows the deck/note discipline: slugify(title) +
 * 8-hex suffix, regenerated on 23505 (unique (owner_id, slug)) collisions.
 */
export async function createCourseRow(
  userId: string,
  input: {
    name: string;
    code: string | null;
    language: string;
    visibility: Database['public']['Enums']['visibility'];
    institutionId: string | null;
    degreeId: string | null;
  },
): Promise<Result<{ id: string }>> {
  const supabase = await createSupabaseServerClient();

  const { data: base, error: slugErr } = await supabase.rpc('slugify', {
    p_input: input.name,
  });
  if (slugErr || !base) return err('error.unexpected', slugErr);

  for (let attempt = 0; attempt < MAX_SLUG_RETRIES; attempt++) {
    const suffix = crypto.randomUUID().replace(/-/g, '').slice(0, 8);
    const slug = `${base}-${suffix}`;

    const { data, error } = await supabase
      .from('courses')
      .insert({
        owner_id: userId,
        slug,
        name: input.name,
        code: input.code,
        language: input.language,
        visibility: input.visibility,
        institution_id: input.institutionId,
        degree_id: input.degreeId,
      })
      .select('id')
      .single();

    if (error) {
      // 23505 = unique_violation (slug collision); P0001 = visibility trigger.
      if (error.code === '23505' && attempt < MAX_SLUG_RETRIES - 1) continue;
      return err(courseError(error), error);
    }

    return ok({ id: data.id });
  }

  return err('error.unexpected');
}

/* ------------------------------------------------------------------ */
/*  Update                                                             */
/* ------------------------------------------------------------------ */

/**
 * Update a course's editable fields. `slug` is immutable (decision 6) and
 * `deleted_at` is not in the UPDATE grant (H8).
 */
export async function updateCourseRow(
  userId: string,
  input: {
    id: string;
    name?: string;
    code?: string | null;
    language?: string;
    visibility?: Database['public']['Enums']['visibility'];
    institutionId?: string | null;
    degreeId?: string | null;
  },
): Promise<Result<void>> {
  const supabase = await createSupabaseServerClient();

  const patch: Database['public']['Tables']['courses']['Update'] = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.code !== undefined) patch.code = input.code;
  if (input.language !== undefined) patch.language = input.language;
  if (input.visibility !== undefined) patch.visibility = input.visibility;
  if (input.institutionId !== undefined) patch.institution_id = input.institutionId;
  if (input.degreeId !== undefined) patch.degree_id = input.degreeId;

  if (Object.keys(patch).length === 0) return ok(undefined);

  const { error } = await supabase
    .from('courses')
    .update(patch)
    .eq('id', input.id)
    .eq('owner_id', userId);

  if (error) return err(courseError(error), error);
  return ok(undefined);
}

/**
 * Delete a course. Always the RPC (0011), never a direct table delete: the
 * RPC auto-forks every subscriber holding progress before removing the course,
 * which is the whole point of decision 11. A direct DELETE would orphan the
 * decks and leave subscribers' states pointing at content the owner wanted
 * gone.
 */
export async function deleteCourseRow(courseId: string): Promise<Result<void>> {
  const supabase = await createSupabaseServerClient();

  // The RPC checks ownership itself (auth.uid() vs courses.owner_id) — no
  // userId param to re-check here; the action re-checks the session.
  const { error } = await supabase.rpc('delete_course', { p_course_id: courseId });

  if (error) return err(courseError(error), error);
  return ok(undefined);
}

/* ------------------------------------------------------------------ */
/*  Subscription checks                                                */
/* ------------------------------------------------------------------ */

/**
 * Check if the user is subscribed to a course.
 * Runs under the caller's RLS (createSupabaseServerClient), so it only
 * sees the caller's own subscription row.
 */
export async function checkCourseSubscription(
  userId: string,
  courseId: string,
): Promise<Result<boolean>> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from('course_subscriptions')
    .select('user_id')
    .eq('course_id', courseId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) return err('error.unexpected', error);
  return ok(!!data);
}

const MAX_SLUG_RETRIES = 3;
