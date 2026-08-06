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
 * AC19 — owner DELETE on decks/cards (granted to authenticated in 0007,
 * enforced by decks_delete_own / cards_delete_own) must not destroy OTHER
 * users' progress.
 *
 * card_states.card_id is `on delete cascade` (0004), so before 0008 a deck
 * owner hitting delete wiped every subscriber's and forker's card_states —
 * ADR-002 calls progress loss "silent and unforgivable", and this suite was
 * the structural gap: nothing exercised a DELETE cascade, so the hole existed
 * under green tests.
 *
 * The fix (0008) is a pair of BEFORE DELETE triggers that block the delete
 * entirely when any card_states row references a card from a user OTHER than
 * the deck owner. The owner's own states are allowed to cascade (they chose to
 * delete their own progress), but other users' rows are protected by the
 * delete being refused.
 *
 * Two triggers are required because the CASCADE path differs from the direct
 * path. Deleting a deck cascades deck → cards → card_states; the deck-level
 * trigger runs first, while the deck row (with owner_id) still exists, and
 * blocks the whole cascade. A card-level trigger alone could not do this: on a
 * deck CASCADE the card trigger fires after the deck row is gone, so its owner
 * lookup returns NULL and the delete slips through. The card-level trigger
 * handles direct card deletes (deck still exists).
 */

let owner: TestUser;
let subscriber: TestUser;

beforeAll(async () => {
  owner = await createTestUser('cascade-owner');
  subscriber = await createTestUser('cascade-sub');
  await makePro(owner.id);
}, 30_000);

afterAll(async () => {
  await deleteTestUser(owner.id);
  await deleteTestUser(subscriber.id);
});

describe('deleting a deck is blocked when other users have card_states (AC19)', () => {
  it('deck delete fails and subscriber card_states survive intact', async () => {
    const deck = await createDeck(owner.id, { visibility: 'public' });
    const card = await createCard(deck.id);

    // Representative of ~90 days of accumulated review history on this card.
    const dueAt = new Date('2026-05-01T00:00:00.000Z').toISOString();
    await createCardState(subscriber.id, card, {
      stability: 15.234,
      difficulty: 6.789,
      phase: 'review',
      learning_steps: 0,
      reps: 42,
      lapses: 3,
      due_at: dueAt,
      last_reviewed_at: new Date('2026-04-20T00:00:00.000Z').toISOString(),
    });

    // The delete is blocked by the 0008 trigger: the subscriber's card_states
    // reference the card, and they are not the deck owner.
    const { error } = await owner.client.from('decks').delete().eq('id', deck.id);
    expect(error).not.toBeNull();
    expect(error?.code).not.toBeNull(); // FK or trigger violation

    // The deck is still there.
    const { data: deckStill } = await admin.from('decks').select('id').eq('id', deck.id);
    expect(deckStill).toHaveLength(1);

    // The subscriber's progress row is untouched — the delete never happened.
    const { data: state } = await admin
      .from('card_states')
      .select('*')
      .eq('user_id', subscriber.id)
      .eq('card_id', card.id)
      .single();
    expect(state).not.toBeNull();
    expect(state?.stability).toBeCloseTo(15.234, 5);
    expect(state?.difficulty).toBeCloseTo(6.789, 5);
    expect(state?.phase).toBe('review');
    expect(state?.reps).toBe(42);
    expect(state?.lapses).toBe(3);
    expect(new Date(state!.due_at!).getTime()).toBe(new Date(dueAt).getTime());
  });
});

describe('deleting a single card is blocked when other users have card_states (AC19)', () => {
  it('card delete fails and the state is untouched', async () => {
    const deck = await createDeck(owner.id, { visibility: 'public' });
    const card = await createCard(deck.id);

    await createCardState(subscriber.id, card, { stability: 3.5, lapses: 1 });

    const { error } = await owner.client.from('cards').delete().eq('id', card.id);
    expect(error).not.toBeNull();

    const { data: cardStill } = await admin.from('cards').select('id').eq('id', card.id);
    expect(cardStill).toHaveLength(1);

    const { data: state } = await admin
      .from('card_states')
      .select('*')
      .eq('user_id', subscriber.id)
      .eq('card_id', card.id)
      .single();
    expect(state).not.toBeNull();
    expect(state?.stability).toBeCloseTo(3.5, 5);
  });
});

describe('owner can delete their own card when no other users have states', () => {
  it('card delete succeeds and the owner own card_states cascade away', async () => {
    const deck = await createDeck(owner.id, { visibility: 'public' });
    const card = await createCard(deck.id);

    await createCardState(owner.id, card, { stability: 5, lapses: 0 });

    const { error } = await owner.client.from('cards').delete().eq('id', card.id);
    expect(error).toBeNull();

    const { data: gone } = await admin.from('cards').select('id').eq('id', card.id);
    expect(gone).toHaveLength(0);

    // Owner own state is cascade-deleted — they chose to delete their own
    // progress. The trigger only blocks when OTHER users' states are present.
    const { data: state } = await admin
      .from('card_states')
      .select('*')
      .eq('user_id', owner.id)
      .eq('card_id', card.id);
    expect(state).toHaveLength(0);
  });
});
