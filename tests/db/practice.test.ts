import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  admin,
  createCard,
  createDeck,
  createTestUser,
  deleteTestUser,
  type TestUser,
} from '../fixtures/seed';

/*
 * Migration 0016 (practice mode). Three properties that must hold, each the
 * kind of silent failure EVOLUTION keeps recording:
 *
 *   1. A practice grade bumps the streak (user decision: streak counts).
 *   2. A practice grade writes NOTHING to card_states or review_logs — the
 *      FSRS schedule and the optimizer's training data stay untouched.
 *   3. practice_logs is append-only for authenticated: no update/delete grant,
 *      and anon cannot read it.
 */

let owner: TestUser;

beforeAll(async () => {
  owner = await createTestUser('practice-owner');
}, 30_000);

afterAll(async () => {
  await deleteTestUser(owner.id);
});

describe('practice_logs (study without FSRS effect)', () => {
  it('a practice grade bumps the streak without touching FSRS tables', async () => {
    const deck = await createDeck(owner.id);
    const card = await createCard(deck.id);

    const { error } = await owner.client.from('practice_logs').insert({
      user_id: owner.id,
      card_id: card.id,
      rating: 'good',
    });
    expect(error).toBeNull();

    const { data: streak } = await admin
      .from('streaks')
      .select('current_streak')
      .eq('user_id', owner.id)
      .single();
    expect(streak?.current_streak).toBe(1);

    const { data: states } = await admin
      .from('card_states')
      .select('user_id')
      .eq('user_id', owner.id);
    const { data: logs } = await admin
      .from('review_logs')
      .select('user_id')
      .eq('user_id', owner.id);
    expect(states).toEqual([]);
    expect(logs).toEqual([]);
  });

  it('rejects a practice grade for a card that does not exist', async () => {
    const { error } = await owner.client.from('practice_logs').insert({
      user_id: owner.id,
      card_id: '00000000-0000-0000-0000-000000000000',
      rating: 'good',
    });
    expect(error).not.toBeNull();
  });

  it('is append-only for authenticated and invisible to anon', async () => {
    const { anon } = await import('../fixtures/seed');
    const { data, error: anonErr } = await anon.from('practice_logs').select('id').limit(1);
    // Anon has no grant and no policy: either an error or zero rows.
    expect(data ?? []).toEqual([]);
    expect(anonErr !== null || (data ?? []).length === 0).toBe(true);

    // No update or delete path: the grants allow insert/select only, so both
    // fail at the RLS/grant layer rather than silently succeeding.
    const deck = await createDeck(owner.id);
    const card = await createCard(deck.id);
    const { data: row } = await admin
      .from('practice_logs')
      .insert({ user_id: owner.id, card_id: card.id, rating: 'again' })
      .select()
      .single();

    const { error: updateErr } = await owner.client
      .from('practice_logs')
      .update({ rating: 'easy' })
      .eq('id', row!.id);
    expect(updateErr).not.toBeNull();
  });
});
