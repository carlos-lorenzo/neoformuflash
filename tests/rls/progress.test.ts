import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  admin,
  createCard,
  createCardState,
  createDeck,
  createTestUser,
  deleteTestUser,
  makePro,
  type TestUser,
} from '../fixtures/seed';

/*
 * AC 5, 6, 16 — card_states/review_logs/user_api_keys/fsrs_parameters are
 * strictly self-only (no public policy of any kind, per 0007's own comment);
 * two users reviewing the same public deck stay fully independent; a review
 * submission writes card_states and review_logs atomically.
 */

let userA: TestUser;
let userB: TestUser;

beforeAll(async () => {
  userA = await createTestUser('progress-a');
  userB = await createTestUser('progress-b');
}, 30_000);

afterAll(async () => {
  await deleteTestUser(userA.id);
  await deleteTestUser(userB.id);
});

describe('card_states is strictly self-only (AC5)', () => {
  it('user B cannot read or write user A card_states under any query', async () => {
    const deck = await createDeck(userA.id, { visibility: 'public' });
    const card = await createCard(deck.id);
    const state = await createCardState(userA.id, card);

    const { data: readAttempt } = await userB.client
      .from('card_states')
      .select('*')
      .eq('user_id', userA.id)
      .eq('card_id', card.id);
    expect(readAttempt).toHaveLength(0);

    const { data: unfiltered } = await userB.client.from('card_states').select('*');
    expect(unfiltered?.some((row) => row.user_id === userA.id)).toBe(false);

    const { error: updateError } = await userB.client
      .from('card_states')
      .update({ stability: 99 })
      .eq('user_id', userA.id)
      .eq('card_id', card.id);
    expect(updateError).toBeNull(); // RLS filters, no row matches — no error, no effect

    const { data: unchanged } = await admin
      .from('card_states')
      .select('stability')
      .eq('user_id', userA.id)
      .eq('card_id', card.id)
      .single();
    expect(unchanged?.stability).toBe(state.stability);
  });
});

describe('review_logs, user_api_keys, fsrs_parameters are strictly self-only (AC5)', () => {
  it('review_logs rows are invisible to another user', async () => {
    const deck = await createDeck(userA.id, { visibility: 'public' });
    const card = await createCard(deck.id);
    await admin.from('review_logs').insert({
      user_id: userA.id,
      card_id: card.id,
      rating: 'good',
      phase: 'new',
      elapsed_days: 0,
      scheduled_days: 1,
      review_stability: 0,
      review_difficulty: 0,
    });

    const { data } = await userB.client.from('review_logs').select('*').eq('user_id', userA.id);
    expect(data).toHaveLength(0);
  });

  it('user_api_keys rows are invisible to another user', async () => {
    await admin.from('user_api_keys').insert({
      user_id: userA.id,
      provider: 'openai',
      ciphertext: '\\x00',
      iv: '\\x00',
      last_four: '1234',
    });

    // Only the metadata columns are SELECT-granted to authenticated
    // (ciphertext/iv are never; see grants.test.ts). Selecting the granted set
    // keeps this a pure RLS row-filter assertion.
    const { data } = await userB.client
      .from('user_api_keys')
      .select('user_id, provider, last_four')
      .eq('user_id', userA.id);
    expect(data).toHaveLength(0);
  });

  it('fsrs_parameters rows are invisible to another user', async () => {
    await admin.from('fsrs_parameters').insert({
      user_id: userA.id,
      weights: new Array(21).fill(0.1),
    });

    const { data } = await userB.client.from('fsrs_parameters').select('*').eq('user_id', userA.id);
    expect(data).toHaveLength(0);
  });
});

describe('two users on one public deck stay independent (AC6)', () => {
  it('reviewing the same card keeps each user own progress row, invisible to the other', async () => {
    const deck = await createDeck(userA.id, { visibility: 'public' });
    const card = await createCard(deck.id);

    const stateA = await createCardState(userA.id, card, { stability: 5, reps: 3 });
    const stateB = await createCardState(userB.id, card, { stability: 12, reps: 8 });

    const { data: aView } = await userA.client.from('card_states').select('*').eq('card_id', card.id);
    expect(aView).toHaveLength(1);
    expect(aView?.[0]?.stability).toBe(stateA.stability);

    const { data: bView } = await userB.client.from('card_states').select('*').eq('card_id', card.id);
    expect(bView).toHaveLength(1);
    expect(bView?.[0]?.stability).toBe(stateB.stability);
  });
});

describe('apply_review writes card_states and review_logs atomically (AC16)', () => {
  it('a successful review writes both rows', async () => {
    const deck = await createDeck(userA.id, { visibility: 'public' });
    const card = await createCard(deck.id);

    const dueAt = new Date('2026-08-10T00:00:00.000Z').toISOString();
    const { error } = await userA.client.rpc('apply_review', {
      p_card_id: card.id,
      p_rating: 'good',
      p_phase_before: 'new',
      p_elapsed_days: 0,
      p_scheduled_days: 1,
      p_review_stability: 0,
      p_review_difficulty: 0,
      p_lapses: 0,
      p_stability: 2.5,
      p_difficulty: 5.0,
      p_phase: 'learning',
      p_due_at: dueAt,
      p_learning_steps: 1,
      p_elapsed_ms: 1500,
      p_edited_during_review: false,
    });
    expect(error).toBeNull();

    const { data: state } = await admin
      .from('card_states')
      .select('*')
      .eq('user_id', userA.id)
      .eq('card_id', card.id)
      .single();
    expect(new Date(state!.due_at!).getTime()).toBe(new Date(dueAt).getTime());
    expect(state?.reps).toBe(1);

    const { data: logs } = await admin
      .from('review_logs')
      .select('*')
      .eq('user_id', userA.id)
      .eq('card_id', card.id);
    expect(logs).toHaveLength(1);
    expect(logs?.[0]?.rating).toBe('good');
  });

  it('an invalid card_id fails the whole call — no orphan card_states or review_logs row', async () => {
    const fakeCardId = '00000000-0000-0000-0000-000000000000';
    const { error } = await userA.client.rpc('apply_review', {
      p_card_id: fakeCardId,
      p_rating: 'good',
      p_phase_before: 'new',
      p_elapsed_days: 0,
      p_scheduled_days: 1,
      p_review_stability: 0,
      p_review_difficulty: 0,
      p_lapses: 0,
      p_stability: 2.5,
      p_difficulty: 5.0,
      p_phase: 'learning',
      p_due_at: new Date().toISOString(),
      p_learning_steps: 1,
      p_elapsed_ms: 1500,
      p_edited_during_review: false,
    });
    expect(error).not.toBeNull();

    const { data: state } = await admin.from('card_states').select('*').eq('card_id', fakeCardId);
    expect(state).toHaveLength(0);

    const { data: logs } = await admin.from('review_logs').select('*').eq('card_id', fakeCardId);
    expect(logs).toHaveLength(0);
  });

  it('a card inside another user private deck is rejected, even though it bypasses RLS as security definer', async () => {
    await makePro(userA.id);
    const privateDeck = await createDeck(userA.id, { visibility: 'private' });
    const card = await createCard(privateDeck.id);

    const { error } = await userB.client.rpc('apply_review', {
      p_card_id: card.id,
      p_rating: 'good',
      p_phase_before: 'new',
      p_elapsed_days: 0,
      p_scheduled_days: 1,
      p_review_stability: 0,
      p_review_difficulty: 0,
      p_lapses: 0,
      p_stability: 2.5,
      p_difficulty: 5.0,
      p_phase: 'learning',
      p_due_at: new Date().toISOString(),
      p_learning_steps: 1,
      p_elapsed_ms: 1500,
      p_edited_during_review: false,
    });
    expect(error).not.toBeNull();

    const { data: state } = await admin.from('card_states').select('*').eq('card_id', card.id);
    expect(state).toHaveLength(0);
  });
});
