'use server';

/**
 * Server actions for share (subscribe, fork, unsubscribe).
 *
 * Pattern copied from app/app/decks/actions.ts:
 *   - Re-check auth on every call (a stale tab must not bypass the gate)
 *   - Zod validation with catalog-key errors (never prose)
 *   - Delegate persistence to Supabase RPCs (no direct table access here)
 */

import { SubscribeInput, ForkInput, type ForkResult } from '@neoformuflash/contracts';
import type { Route } from 'next';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getSessionUser } from '@/lib/supabase/session';

/* ------------------------------------------------------------------ */
/*  Subscribe                                                          */
/* ------------------------------------------------------------------ */

export type SubscribeState = {
  ok?: boolean;
  error?: string;
  targetType?: 'course' | 'deck';
};

/**
 * Subscribe to a course or deck.
 * Called from a form — the targetId and targetType come from hidden inputs.
 */
export async function subscribe(
  _previous: SubscribeState,
  formData: FormData,
): Promise<SubscribeState> {
  const user = await getSessionUser();
  if (!user) return { error: 'error.unexpected' };

  const rawTargetId = formData.get('targetId');
  const rawTargetType = formData.get('targetType');

  const parsed = SubscribeInput.safeParse({
    targetId: typeof rawTargetId === 'string' ? rawTargetId : undefined,
    targetType: typeof rawTargetType === 'string' ? rawTargetType : undefined,
  });

  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];
    const message = parsed.error.issues[0]?.message;
    return { error: typeof field === 'string' && message ? message : 'error.unexpected' };
  }

  const { targetId, targetType } = parsed.data;

  const supabase = await createSupabaseServerClient();
  const rpcName = targetType === 'course' ? 'subscribe_to_course' : 'subscribe_to_deck';
  const rpcParam = targetType === 'course' ? { p_course_id: targetId } : { p_deck_id: targetId };

  const { error } = await supabase.rpc(rpcName, rpcParam);

  if (error) {
    // RPC raises P0001 for private/own/deleted targets; P0002 for not found
    if (error.code === 'P0001' || error.code === 'P0002') {
      return { error: error.message };
    }
    return { error: 'error.unexpected' };
  }

  // Revalidate public pages so subscriber counts and button state refresh.
  revalidatePath('/[handle]/courses/[courseSlug]', 'page');
  revalidatePath('/[handle]/[...slug]', 'page');
  revalidatePath('/[handle]', 'page');
  revalidatePath('/app/courses');
  revalidatePath('/app');

  // Land the subscriber inside the app on the course/deck they just subscribed
  // to (same behaviour as fork).
  if (targetType === 'course') {
    redirect(`/app/courses/${targetId}` as Route);
  }
  if (targetType === 'deck') {
    redirect(`/app/decks/${targetId}` as Route);
  }

  return { ok: true, targetType };
}

/* ------------------------------------------------------------------ */
/*  Fork                                                               */
/* ------------------------------------------------------------------ */

export type ForkState = {
  ok?: boolean;
  error?: string;
  result?: ForkResult;
  targetType?: 'course' | 'deck';
};

/**
 * Fork a course or deck.
 * Called from a form — the targetId and targetType come from hidden inputs.
 * On success, redirects to the new course/deck in /app.
 */
export async function fork(
  _previous: ForkState,
  formData: FormData,
): Promise<ForkState> {
  const user = await getSessionUser();
  if (!user) return { error: 'error.unexpected' };

  const rawTargetId = formData.get('targetId');
  const rawTargetType = formData.get('targetType');

  const parsed = ForkInput.safeParse({
    targetId: typeof rawTargetId === 'string' ? rawTargetId : undefined,
    targetType: typeof rawTargetType === 'string' ? rawTargetType : undefined,
  });

  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];
    const message = parsed.error.issues[0]?.message;
    return { error: typeof field === 'string' && message ? message : 'error.unexpected' };
  }

  const { targetId, targetType } = parsed.data;

  const supabase = await createSupabaseServerClient();
  const rpcName = targetType === 'course' ? 'fork_course' : 'fork_deck';
  const rpcParam = targetType === 'course' ? { p_course_id: targetId } : { p_deck_id: targetId };

  const { data, error } = await supabase.rpc(rpcName, rpcParam);

  if (error) {
    // RPC raises P0001 for private/own targets; P0002 for not found
    if (error.code === 'P0001' || error.code === 'P0002') {
      return { error: error.message };
    }
    return { error: 'error.unexpected' };
  }

  // Map snake_case DB result to camelCase ForkResult
  const raw = data as unknown as { course_id: string | null; deck_id: string | null; states_carried: number | null };
  const result: ForkResult = {
    courseId: raw.course_id,
    deckId: raw.deck_id,
    statesCarried: raw.states_carried ?? 0,
  };

  // Revalidate public pages so fork counts refresh.
  revalidatePath('/[handle]/courses/[courseSlug]', 'page');
  revalidatePath('/[handle]/[...slug]', 'page');
  revalidatePath('/[handle]', 'page');
  revalidatePath('/app/courses');
  revalidatePath('/app');

  // Redirect to the new course/deck in /app
  if (targetType === 'course' && result.courseId) {
    redirect(`/app/courses/${result.courseId}` as Route);
  }
  if (targetType === 'deck' && result.deckId) {
    redirect(`/app/decks/${result.deckId}` as Route);
  }

  // Should not happen — RPC always returns one of the two
  return { ok: true, result, targetType };
}

/* ------------------------------------------------------------------ */
/*  Unsubscribe                                                        */
/* ------------------------------------------------------------------ */

export type UnsubscribeState = {
  ok?: boolean;
  error?: string;
  targetType?: 'course' | 'deck';
};

/**
 * Unsubscribe from a course or deck.
 * Direct authenticated DELETE on the subscription table (RLS enforces ownership).
 * Called from a form — the targetId and targetType come from hidden inputs.
 */
export async function unsubscribe(
  _previous: UnsubscribeState,
  formData: FormData,
): Promise<UnsubscribeState> {
  const user = await getSessionUser();
  if (!user) return { error: 'error.unexpected' };

  const rawTargetId = formData.get('targetId');
  const rawTargetType = formData.get('targetType');

  const targetId = typeof rawTargetId === 'string' ? rawTargetId : undefined;
  const targetType = typeof rawTargetType === 'string' ? rawTargetType : undefined;

  if (!targetId || !targetType || (targetType !== 'course' && targetType !== 'deck')) {
    return { error: 'error.unexpected' };
  }

  const supabase = await createSupabaseServerClient();

  if (targetType === 'course') {
    const { error } = await supabase
      .from('course_subscriptions')
      .delete()
      .eq('course_id', targetId);
    if (error) {
      return { error: 'error.unexpected' };
    }
  } else {
    const { error } = await supabase
      .from('deck_subscriptions')
      .delete()
      .eq('deck_id', targetId);
    if (error) {
      return { error: 'error.unexpected' };
    }
  }

  // Revalidate public pages so subscriber counts and button state refresh.
  revalidatePath('/[handle]/courses/[courseSlug]', 'page');
  revalidatePath('/[handle]/[...slug]', 'page');
  revalidatePath('/[handle]', 'page');
  revalidatePath('/app/courses');
  revalidatePath('/app');

  return { ok: true, targetType };
}