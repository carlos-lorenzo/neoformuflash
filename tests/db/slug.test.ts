import { createClient } from '@supabase/supabase-js';
import { afterAll, describe, expect, it } from 'vitest';

/*
 * Acceptance criterion 1b: signup derives an immutable slug and an editable
 * handle from the Google account, resolving collisions with a numeric suffix.
 * Accented and non-Latin display names still produce a valid slug.
 *
 * The slug is the permanent public URL (decision 6) — it can never be changed
 * after signup, so getting it wrong is not a bug you patch later, it is a
 * broken link in a WhatsApp group forever.
 */

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

/** The check constraint the generated slug has to satisfy. */
const SLUG_PATTERN = /^[a-z0-9][a-z0-9_-]{2,29}$/;

async function slugify(input: string): Promise<string> {
  const { data, error } = await admin.rpc('slugify', { p_input: input });
  if (error) throw new Error(error.message);
  return data as string;
}

async function claim(base: string): Promise<string> {
  const { data, error } = await admin.rpc('claim_profile_slug', { p_base: base });
  if (error) throw new Error(error.message);
  return data as string;
}

const createdUserIds: string[] = [];

/** Take a slug by actually inserting a profile, so the next claim must avoid it. */
async function occupySlug(slug: string, displayName: string): Promise<void> {
  const { data, error } = await admin.auth.admin.createUser({
    email: `slug-${slug}-${Date.now()}@example.test`,
    password: 'test-password-not-a-secret',
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(error?.message);
  createdUserIds.push(data.user.id);

  const { error: insertError } = await admin
    .from('profiles')
    .insert({ id: data.user.id, slug, handle: slug, display_name: displayName });
  if (insertError) throw new Error(insertError.message);
}

afterAll(async () => {
  for (const id of createdUserIds) await admin.auth.admin.deleteUser(id);
});

describe('slugify', () => {
  it.each([
    ['José Martínez-Peña', 'jose-martinez-pena'], // named explicitly in AC 1b
    ['Àlex Puig i Ferré', 'alex-puig-i-ferre'],
    ['Ana  Ruiz  Gómez!!', 'ana-ruiz-gomez'],
    ['  Padded  Name  ', 'padded-name'],
    ['MiXeD CaSe', 'mixed-case'],
    ['Núria Sánchez', 'nuria-sanchez'],
  ])('folds %s to %s', async (input, expected) => {
    expect(await slugify(input)).toBe(expected);
  });

  it('produces nothing usable from a non-Latin script, which is the caller\'s cue', async () => {
    expect(await slugify('李明')).toBe('');
    expect(await slugify('Мария')).toBe('');
  });
});

describe('claim_profile_slug', () => {
  it('returns a valid slug for an accented name', async () => {
    const slug = await claim('José Martínez-Peña');
    expect(slug).toMatch(SLUG_PATTERN);
  });

  it('resolves collisions with a numeric suffix (AC 1b)', async () => {
    const base = `Collide ${Date.now()}`;
    const first = await claim(base);
    await occupySlug(first, base);

    const second = await claim(base);
    expect(second).not.toBe(first);
    expect(second).toBe(`${first}-2`);
    expect(second).toMatch(SLUG_PATTERN);

    await occupySlug(second, base);
    expect(await claim(base)).toBe(`${first}-3`);
  });

  it.each([
    ['a non-Latin name', '李明'],
    ['a name shorter than the 3-character minimum', 'Bo'],
    ['an empty name', ''],
    ['punctuation only', '!!!'],
  ])('still produces a valid slug for %s', async (_label, input) => {
    // A student called 李明 must be able to finish signing up. Falling back to a
    // generated base is the difference between that and a 500 at the last step.
    const slug = await claim(input);
    expect(slug).toMatch(SLUG_PATTERN);
    expect(slug.startsWith('user-')).toBe(true);
  });

  it('never exceeds the 30-character limit the constraint allows', async () => {
    const slug = await claim('Maria Del Carmen Fernandez De La Torre Y Villanueva Segunda');
    expect(slug.length).toBeLessThanOrEqual(30);
    expect(slug).toMatch(SLUG_PATTERN);
  });
});
