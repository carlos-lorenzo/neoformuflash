import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@neoformuflash/contracts/db';

/*
 * Shared fixture builder for the phase 01 RLS/db suites (tests/rls/content,
 * tests/rls/progress, tests/db/sharing, tests/db/card-version, tests/db/queue).
 *
 * Every builder writes through the service-role client (RLS bypassed by
 * design — grants insert exactly the columns product code will ever supply)
 * so a test can set up state that would itself be illegal for the role under
 * test to write, without that setup polluting what the test measures.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export const admin: SupabaseClient<Database> = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

export const anon: SupabaseClient<Database> = createClient(SUPABASE_URL, ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

export interface TestUser {
  id: string;
  email: string;
  client: SupabaseClient<Database>;
}

let counter = 0;
/** Monotonic per-process suffix so parallel fixtures in one test file never collide on slug/name. */
function unique(label: string): string {
  counter += 1;
  return `${label}-${Date.now()}-${counter}`;
}

/**
 * Same uniqueness guarantee as `unique`, but bounded to profiles.slug/handle's
 * `^[a-z0-9][a-z0-9_-]{2,29}$` check constraint (30 chars total) — a base36
 * timestamp+counter suffix instead of unique()'s decimal one, with the label
 * truncated to whatever's left.
 */
function uniqueSlug(label: string): string {
  counter += 1;
  const suffix = `${Date.now().toString(36)}${counter.toString(36)}`;
  const base = label
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, Math.max(30 - suffix.length - 1, 1));
  return `${base}-${suffix}`;
}

export async function createTestUser(label: string): Promise<TestUser> {
  const email = `fx-${unique(label)}@example.test`;
  const password = 'test-password-not-a-secret';

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`could not create user ${label}: ${error?.message}`);

  const slug = uniqueSlug(label);
  const { error: profileError } = await admin
    .from('profiles')
    .insert({ id: data.user.id, slug, handle: slug, display_name: label });
  if (profileError) throw new Error(`could not seed profile for ${label}: ${profileError.message}`);

  const client = createClient<Database>(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const signIn = await client.auth.signInWithPassword({ email, password });
  if (signIn.error) throw new Error(`could not sign in ${label}: ${signIn.error.message}`);

  return { id: data.user.id, email, client };
}

export async function deleteTestUser(id: string): Promise<void> {
  await admin.auth.admin.deleteUser(id);
}

export async function makePro(userId: string): Promise<void> {
  const { error } = await admin.from('profiles').update({ is_pro: true }).eq('id', userId);
  if (error) throw new Error(`could not mark ${userId} pro: ${error.message}`);
}

type Visibility = Database['public']['Enums']['visibility'];

export async function createCourse(
  ownerId: string,
  overrides: Partial<Database['public']['Tables']['courses']['Insert']> = {}
) {
  const { data, error } = await admin
    .from('courses')
    .insert({
      owner_id: ownerId,
      slug: unique('course'),
      name: 'Test Course',
      visibility: 'public' as Visibility,
      ...overrides,
    })
    .select()
    .single();
  if (error) throw new Error(`could not create course: ${error.message}`);
  return data;
}

export async function createNote(
  ownerId: string,
  overrides: Partial<Database['public']['Tables']['notes']['Insert']> = {}
) {
  const { data, error } = await admin
    .from('notes')
    .insert({
      owner_id: ownerId,
      slug: unique('note'),
      title: 'Test Note',
      visibility: 'public' as Visibility,
      ...overrides,
    })
    .select()
    .single();
  if (error) throw new Error(`could not create note: ${error.message}`);
  return data;
}

export async function createDeck(
  ownerId: string,
  overrides: Partial<Database['public']['Tables']['decks']['Insert']> = {}
) {
  const { data, error } = await admin
    .from('decks')
    .insert({
      owner_id: ownerId,
      slug: unique('deck'),
      title: 'Test Deck',
      visibility: 'public' as Visibility,
      ...overrides,
    })
    .select()
    .single();
  if (error) throw new Error(`could not create deck: ${error.message}`);
  return data;
}

export async function createCard(
  deckId: string,
  overrides: Partial<Database['public']['Tables']['cards']['Insert']> = {}
) {
  const doc = { type: 'doc', content: [] };
  const { data, error } = await admin
    .from('cards')
    .insert({
      deck_id: deckId,
      front_json: doc,
      back_json: doc,
      front_text: 'front',
      back_text: 'back',
      ...overrides,
    })
    .select()
    .single();
  if (error) throw new Error(`could not create card: ${error.message}`);
  return data;
}

export async function createCardState(
  userId: string,
  card: { id: string; deck_id: string },
  overrides: Partial<Database['public']['Tables']['card_states']['Insert']> = {}
) {
  const { data, error } = await admin
    .from('card_states')
    .insert({
      user_id: userId,
      card_id: card.id,
      deck_id: card.deck_id,
      ...overrides,
    })
    .select()
    .single();
  if (error) throw new Error(`could not create card_state: ${error.message}`);
  return data;
}
