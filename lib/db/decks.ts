/**
 * Deck data access.
 *
 * Column-grant discipline (supabase/migrations/0007):
 *   insert: owner_id, course_id, note_id, slug, title, visibility, desired_retention, new_cards_per_day
 *   update: title, visibility, desired_retention, new_cards_per_day, course_id
 *
 * `slug` is NOT in the UPDATE grant (decision 6: immutable after first publish).
 * `created_at` and `updated_at` are trigger-managed.
 * `subscriber_count` / `fork_count` are trigger-maintained and never appear in INSERT or UPDATE.
 * `source_deck_id` is set only by fork_deck (security definer) — never in INSERT.
 */

import type { Database } from '@neoformuflash/contracts/db';
import { err, ok, type Result } from '@/lib/result';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type Visibility = Database['public']['Enums']['visibility'];

export type DeckSummary = {
  id: string;
  title: string;
  slug: string;
  visibility: Visibility;
  desiredRetention: number | null;
  newCardsPerDay: number;
  courseId: string | null;
  createdAt: string;
  dueCount: number;
  newCount: number;
};

export type DeckRow = {
  id: string;
  ownerId: string;
  title: string;
  slug: string;
  visibility: Visibility;
  desiredRetention: number | null;
  newCardsPerDay: number;
  courseId: string | null;
  course: { id: string; slug: string; name: string; visibility: string; deletedAt: string | null } | null;
  subscriberCount: number;
  forkCount: number;
  createdAt: string;
};

export type Streak = {
  current: number;
  longest: number;
  lastActiveDate: string | null;
};

/* ------------------------------------------------------------------ */
/*  Read                                                               */
/* ------------------------------------------------------------------ */

/**
 * All decks the user can see (owned + subscribed), with due/new counts.
 *
 * The counts come from two lightweight REST queries over the deck ids:
 *   1. Due states: card_states where user = me and due_at <= now, grouped by deck.
 *   2. New cards: cards where id NOT IN (states for this user), grouped by deck.
 *
 * This avoids an RPC and stays in the REST layer. With ≤20 decks and
 * bounded card counts per deck, the data volume is small.
 */
export async function listDecks(userId: string): Promise<Result<DeckSummary[]>> {
  const supabase = await createSupabaseServerClient();
  const now = new Date();

  // 1. Owned decks
  const { data: owned, error: ownedErr } = await supabase
    .from('decks')
    .select('id, title, slug, visibility, desired_retention, new_cards_per_day, course_id, created_at')
    .eq('owner_id', userId)
    .order('created_at', { ascending: false });

  if (ownedErr) return err('error.unexpected', ownedErr);

  // 2. Subscribed decks (user does not own them)
  const { data: subRow, error: subErr } = await supabase
    .from('deck_subscriptions')
    .select('deck_id')
    .eq('user_id', userId);

  if (subErr) return err('error.unexpected', subErr);

  const subDeckIds = (subRow ?? []).map((r) => r.deck_id);
  if (subDeckIds.length === 0 && (owned ?? []).length === 0) return ok([]);

  let subscribed: typeof owned = [];
  if (subDeckIds.length > 0) {
    const { data, error } = await supabase
      .from('decks')
      .select('id, title, slug, visibility, desired_retention, new_cards_per_day, course_id, created_at')
      .in('id', subDeckIds)
      .order('created_at', { ascending: false });
    if (error) return err('error.unexpected', error);
    subscribed = data;
  }

  const allDeckIds = [
    ...(owned ?? []).map((d) => d.id),
    ...(subscribed ?? []).map((d) => d.id),
  ];

  // 3. Due counts: card_states where user = me and deck_id in allDeckIds and due_at <= now
  const { data: dueRows } = await supabase
    .from('card_states')
    .select('deck_id')
    .eq('user_id', userId)
    .in('deck_id', allDeckIds)
    .lte('due_at', now.toISOString());

  const dueCounts = new Map<string, number>();
  for (const row of dueRows ?? []) {
    dueCounts.set(row.deck_id, (dueCounts.get(row.deck_id) ?? 0) + 1);
  }

  // 4. New card counts: cards where id NOT IN (states for this user)
  const { data: stateRows } = await supabase
    .from('card_states')
    .select('card_id')
    .eq('user_id', userId)
    .in('deck_id', allDeckIds);

  const stateCardIds = new Set((stateRows ?? []).map((r) => r.card_id));

  const { data: cardRows } = await supabase
    .from('cards')
    .select('id, deck_id')
    .in('deck_id', allDeckIds);

  const newCounts = new Map<string, number>();
  for (const row of cardRows ?? []) {
    if (!stateCardIds.has(row.id)) {
      newCounts.set(row.deck_id, (newCounts.get(row.deck_id) ?? 0) + 1);
    }
  }

  const mapDeck = (d: NonNullable<typeof owned>[number]): DeckSummary => ({
    id: d.id,
    title: d.title,
    slug: d.slug,
    visibility: d.visibility,
    desiredRetention: d.desired_retention,
    newCardsPerDay: d.new_cards_per_day,
    courseId: d.course_id,
    createdAt: d.created_at,
    dueCount: dueCounts.get(d.id) ?? 0,
    newCount: newCounts.get(d.id) ?? 0,
  });

  const result = [
    ...(owned ?? []).map(mapDeck),
    ...(subscribed ?? []).map(mapDeck),
  ];

  return ok(result);
}

/**
 * A single deck by id. Returns null when the deck doesn't exist or is not
 * visible to the user (RLS handles the containment check).
 *
 * The caller decides whether the user is the owner (canEdit) based on
 * the returned ownerId — not by a separate query.
 */
/**
 * Get a public deck by owner handle and deck slug.
 * Returns null if the deck doesn't exist or is private.
 * Used by the public deck page at /@handle/deck-slug.
 *
 * `decks` has no `deleted_at` column (0003) — deck removal is a hard delete,
 * unlike courses. Filtering on it here returned an error on every request.
 * Parent-course containment is enforced by decks_select_public (0007), so a
 * deck under a private or deleted course is already filtered out by RLS.
 */
export async function getPublicDeckBySlug(
  handle: string,
  deckSlug: string
): Promise<Result<DeckRow | null>> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from('decks')
    .select(`
      id, owner_id, title, slug, visibility, desired_retention, new_cards_per_day,
      course_id, subscriber_count, fork_count, created_at,
      owner:profiles!decks_owner_id_fkey!inner(handle),
      course:courses!decks_course_id_fkey(id, slug, name, visibility, deleted_at)
    `)
    .eq('slug', deckSlug)
    .eq('owner.handle', handle)
    .neq('visibility', 'private')
    .maybeSingle();

  if (error) return err('error.unexpected', error);
  if (!data) return ok(null);

  let courseInfo: DeckRow['course'] = null;
  if (data.course && data.course.visibility !== 'private' && data.course.deleted_at === null) {
    courseInfo = {
      id: data.course.id,
      slug: data.course.slug,
      name: data.course.name,
      visibility: data.course.visibility,
      deletedAt: data.course.deleted_at,
    };
  }

  const result: DeckRow = {
    id: data.id,
    ownerId: data.owner_id,
    title: data.title,
    slug: data.slug,
    visibility: data.visibility,
    desiredRetention: data.desired_retention,
    newCardsPerDay: data.new_cards_per_day,
    courseId: data.course_id,
    course: courseInfo,
    subscriberCount: data.subscriber_count,
    forkCount: data.fork_count,
    createdAt: data.created_at,
  };

  return ok(result);
}

/**
 * Get a public deck by owner handle and deck slug, returning a PublicDeck shape.
 * Includes ownerId for ownership checks on public pages.
 */
export async function getPublicDeckBySlugPublic(
  handle: string,
  deckSlug: string
): Promise<Result<{ id: string; slug: string; title: string; subscriberCount: number; forkCount: number; ownerId: string; course: { id: string; slug: string; name: string } | null } | null>> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from('decks')
    .select(`
      id, owner_id, title, slug, subscriber_count, fork_count,
      owner:profiles!decks_owner_id_fkey!inner(handle),
      course:courses!decks_course_id_fkey(id, slug, name, visibility, deleted_at)
    `)
    .eq('slug', deckSlug)
    .eq('owner.handle', handle)
    .neq('visibility', 'private')
    .maybeSingle();

  if (error) return err('error.unexpected', error);
  if (!data) return ok(null);

  let courseInfo: { id: string; slug: string; name: string } | null = null;
  if (data.course && data.course.visibility !== 'private' && data.course.deleted_at === null) {
    courseInfo = {
      id: data.course.id,
      slug: data.course.slug,
      name: data.course.name,
    };
  }

  return ok({
    id: data.id,
    ownerId: data.owner_id,
    title: data.title,
    slug: data.slug,
    subscriberCount: data.subscriber_count,
    forkCount: data.fork_count,
    course: courseInfo,
  });
}

/**
 * Get a deck by id. The caller decides whether the user is the owner
 * (canEdit) based on the returned ownerId — not by a separate query.
 */
export async function getDeck(
  _userId: string,
  deckId: string,
): Promise<Result<DeckRow | null>> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from('decks')
    .select('*')
    .eq('id', deckId)
    .maybeSingle();

  if (error) return err('error.unexpected', error);
  if (!data) return ok(null);

  return ok({
    id: data.id,
    ownerId: data.owner_id,
    title: data.title,
    slug: data.slug,
    visibility: data.visibility,
    desiredRetention: data.desired_retention,
    newCardsPerDay: data.new_cards_per_day,
    courseId: data.course_id,
    course: null, // course not joined here
    subscriberCount: data.subscriber_count,
    forkCount: data.fork_count,
    createdAt: data.created_at,
  });
}

/**
 * Get the user's current streak (or null if they have never reviewed).
 */
export async function getStreak(userId: string): Promise<Result<Streak | null>> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from('streaks')
    .select('current_streak, longest_streak, last_active_date')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) return err('error.unexpected', error);
  if (!data) return ok(null);

  return ok({
    current: data.current_streak,
    longest: data.longest_streak,
    lastActiveDate: data.last_active_date,
  });
}

/* ------------------------------------------------------------------ */
/*  Slug generation (shared pattern from lib/db/notes.ts)              */
/* ------------------------------------------------------------------ */

const MAX_SLUG_RETRIES = 3;

/* ------------------------------------------------------------------ */
/**
 * The owner's decks inside a single course. Lightweight — no due/new counts,
 * which is the course detail's job only at a glance. Course-first hierarchy
 * (phase-03b H); decks outside a course are still readable (H5).
 */
export async function listCourseDecks(courseId: string, userId: string): Promise<Result<DeckSummary[]>> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from('decks')
    .select('id, title, slug, visibility, desired_retention, new_cards_per_day, course_id, created_at')
    .eq('course_id', courseId)
    .eq('owner_id', userId)
    .order('created_at', { ascending: false });

  if (error) return err('error.unexpected', error);

  return ok((data ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    slug: row.slug,
    visibility: row.visibility as Visibility,
    desiredRetention: row.desired_retention,
    newCardsPerDay: row.new_cards_per_day,
    courseId: row.course_id,
    createdAt: row.created_at,
    dueCount: 0,
    newCount: 0,
  })));
}

/*  Create                                                             */
/* ------------------------------------------------------------------ */

/**
 * Create a new deck. The slug is generated server-side from the title.
 * On collision the suffix is regenerated, matching the notes discipline.
 *
 * The DB default for visibility is 'public', desired_retention null
 * (inherits from profile), new_cards_per_day 20.
 */
export async function createDeckRow(
  userId: string,
  input: { title: string; visibility: Visibility; desiredRetention: number | null; newCardsPerDay: number; courseId?: string | null },
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
      .from('decks')
      .insert({
        owner_id: userId,
        slug,
        title: input.title,
        visibility: input.visibility,
        desired_retention: input.desiredRetention,
        new_cards_per_day: input.newCardsPerDay,
        course_id: input.courseId ?? null,
        note_id: null,
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

  return err('error.unexpected');
}

/* ------------------------------------------------------------------ */
/*  Update                                                             */
/* ------------------------------------------------------------------ */

export async function updateDeckRow(
  userId: string,
  input: {
    id: string;
    title?: string;
    visibility?: Visibility;
    desiredRetention?: number | null;
    newCardsPerDay?: number;
  },
): Promise<Result<{ savedAt: string }>> {
  const supabase = await createSupabaseServerClient();

  const update: Record<string, unknown> = {};
  if (input.title !== undefined) update.title = input.title;
  if (input.visibility !== undefined) update.visibility = input.visibility;
  if (input.desiredRetention !== undefined) update.desired_retention = input.desiredRetention;
  if (input.newCardsPerDay !== undefined) update.new_cards_per_day = input.newCardsPerDay;

  if (Object.keys(update).length === 0) {
    // Nothing to change — fetch existing updated_at for consistency.
    const { data } = await supabase
      .from('decks')
      .select('created_at')
      .eq('id', input.id)
      .eq('owner_id', userId)
      .single();
    return ok({ savedAt: data?.created_at ?? new Date().toISOString() });
  }

  const { data, error } = await supabase
    .from('decks')
    .update(update as Database['public']['Tables']['decks']['Update'])
    .eq('id', input.id)
    .eq('owner_id', userId)
    .select('created_at')
    .single();

  if (error) return err('error.unexpected', error);
  return ok({ savedAt: data.created_at });
}

/* ------------------------------------------------------------------ */
/*  Delete                                                             */
/* ------------------------------------------------------------------ */

/**
 * Delete a deck. The 0008 BEFORE DELETE trigger blocks this when other
 * users have card_states referencing cards in this deck — the error
 * surfaces as a DB-level exception with errcode 'P0001'.
 */
export async function deleteDeckRow(
  userId: string,
  deckId: string,
): Promise<Result<void>> {
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase
    .from('decks')
    .delete()
    .eq('id', deckId)
    .eq('owner_id', userId);

  if (error) {
    // 23503 = foreign_key_violation or 0008 trigger P0001
    if (error.code === 'P0001') return err('deck.hasSubscribers');
    return err('error.unexpected', error);
  }

  return ok(undefined);
}

/* ------------------------------------------------------------------ */
/*  Subscription checks                                                */
/* ------------------------------------------------------------------ */

/**
 * Check if the user is subscribed to a deck.
 * Runs under the caller's RLS (createSupabaseServerClient), so it only
 * sees the caller's own subscription row.
 */
export async function checkDeckSubscription(
  userId: string,
  deckId: string,
): Promise<Result<boolean>> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from('deck_subscriptions')
    .select('user_id')
    .eq('deck_id', deckId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) return err('error.unexpected', error);
  return ok(!!data);
}
