import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { admin, createCard, createCardState, createDeck, createTestUser, deleteTestUser, makePro, type TestUser } from '../fixtures/seed';

/*
 * AC 13, 14 — content_version bumps only on a semantic change (front_text or
 * back_text), never on formatting/reorder/edit-then-revert; acknowledge_card_change
 * dismisses (no re-flag) or resets (returns to new, preserves lapses, writes
 * no review_logs row).
 */

let owner: TestUser;

beforeAll(async () => {
  owner = await createTestUser('card-version-owner');
}, 30_000);

afterAll(async () => {
  await deleteTestUser(owner.id);
});

describe('content_version bumps only on semantic change (AC13)', () => {
  it('editing front_text bumps content_version', async () => {
    const deck = await createDeck(owner.id);
    const card = await createCard(deck.id, { front_text: 'original front' });

    const { data: updated, error } = await admin
      .from('cards')
      .update({ front_text: 'changed front' })
      .eq('id', card.id)
      .select('content_version')
      .single();
    expect(error).toBeNull();
    expect(updated?.content_version).toBe(card.content_version + 1);
  });

  it('editing back_text bumps content_version', async () => {
    const deck = await createDeck(owner.id);
    const card = await createCard(deck.id, { back_text: 'original back' });

    const { data: updated } = await admin
      .from('cards')
      .update({ back_text: 'changed back' })
      .eq('id', card.id)
      .select('content_version')
      .single();
    expect(updated?.content_version).toBe(card.content_version + 1);
  });

  it('changing only formatting (front_json) does not bump content_version', async () => {
    const deck = await createDeck(owner.id);
    const card = await createCard(deck.id, { front_text: 'stable text' });

    const { data: updated } = await admin
      .from('cards')
      .update({ front_json: { type: 'doc', content: [{ type: 'paragraph', content: [] }] } })
      .eq('id', card.id)
      .select('content_version')
      .single();
    expect(updated?.content_version).toBe(card.content_version);
  });

  it('reordering (position) does not bump content_version', async () => {
    const deck = await createDeck(owner.id);
    const card = await createCard(deck.id, { position: 0 });

    const { data: updated } = await admin
      .from('cards')
      .update({ position: 5 })
      .eq('id', card.id)
      .select('content_version')
      .single();
    expect(updated?.content_version).toBe(card.content_version);
  });

  it('editing then reverting front_text still bumps content_version each time (no diffing against history)', async () => {
    const deck = await createDeck(owner.id);
    const card = await createCard(deck.id, { front_text: 'A' });

    const { data: afterEdit } = await admin
      .from('cards')
      .update({ front_text: 'B' })
      .eq('id', card.id)
      .select('content_version')
      .single();
    expect(afterEdit?.content_version).toBe(card.content_version + 1);

    const { data: afterRevert } = await admin
      .from('cards')
      .update({ front_text: 'A' })
      .eq('id', card.id)
      .select('content_version')
      .single();
    // The trigger compares only old vs new on this statement, not the original
    // value — a revert is itself a distinct-from-old change, so it bumps again.
    expect(afterRevert?.content_version).toBe(card.content_version + 2);
  });
});

describe('acknowledge_card_change: dismiss and reset (AC14)', () => {
  it('dismissing sets seen_version to current and does not re-flag next session', async () => {
    const deck = await createDeck(owner.id);
    const card = await createCard(deck.id, { front_text: 'v1' });
    const subscriber = await createTestUser('card-version-sub-dismiss');
    try {
      await createCardState(subscriber.id, card, { seen_version: card.content_version });

      await admin.from('cards').update({ front_text: 'v2' }).eq('id', card.id);
      const { data: bumped } = await admin.from('cards').select('content_version').eq('id', card.id).single();

      const { error } = await subscriber.client.rpc('acknowledge_card_change', {
        p_card_id: card.id,
        p_reset: false,
      });
      expect(error).toBeNull();

      const { data: state } = await admin
        .from('card_states')
        .select('seen_version')
        .eq('user_id', subscriber.id)
        .eq('card_id', card.id)
        .single();
      expect(state?.seen_version).toBe(bumped?.content_version);

      // Calling acknowledge again (simulating a later session) is a no-op — still equal, no re-flag.
      const { error: secondCall } = await subscriber.client.rpc('acknowledge_card_change', {
        p_card_id: card.id,
        p_reset: false,
      });
      expect(secondCall).toBeNull();
      const { data: stateAfter } = await admin
        .from('card_states')
        .select('seen_version')
        .eq('user_id', subscriber.id)
        .eq('card_id', card.id)
        .single();
      expect(stateAfter?.seen_version).toBe(bumped?.content_version);
    } finally {
      await deleteTestUser(subscriber.id);
    }
  });

  it('resetting returns the card to new, preserves lapses, and writes no review_logs row', async () => {
    const deck = await createDeck(owner.id);
    const card = await createCard(deck.id, { front_text: 'v1' });
    const subscriber = await createTestUser('card-version-sub-reset');
    try {
      await createCardState(subscriber.id, card, {
        stability: 20,
        difficulty: 7,
        phase: 'review',
        learning_steps: 0,
        reps: 10,
        lapses: 4,
        due_at: new Date('2026-09-01T00:00:00.000Z').toISOString(),
      });

      const { data: logsBefore } = await admin
        .from('review_logs')
        .select('id')
        .eq('user_id', subscriber.id)
        .eq('card_id', card.id);
      expect(logsBefore).toHaveLength(0);

      const { error } = await subscriber.client.rpc('acknowledge_card_change', {
        p_card_id: card.id,
        p_reset: true,
      });
      expect(error).toBeNull();

      const { data: state } = await admin
        .from('card_states')
        .select('*')
        .eq('user_id', subscriber.id)
        .eq('card_id', card.id)
        .single();
      expect(state?.phase).toBe('new');
      expect(state?.stability).toBe(0);
      expect(state?.difficulty).toBe(5.0);
      expect(state?.learning_steps).toBe(0);
      expect(state?.reps).toBe(0);
      expect(state?.lapses).toBe(4); // preserved

      const { data: logsAfter } = await admin
        .from('review_logs')
        .select('id')
        .eq('user_id', subscriber.id)
        .eq('card_id', card.id);
      expect(logsAfter).toHaveLength(0);
    } finally {
      await deleteTestUser(subscriber.id);
    }
  });

  it('a card inside another user private deck is rejected (security definer must still respect visibility)', async () => {
    await makePro(owner.id);
    const privateDeck = await createDeck(owner.id, { visibility: 'private' });
    const card = await createCard(privateDeck.id);
    const outsider = await createTestUser('card-version-outsider');
    try {
      const { error } = await outsider.client.rpc('acknowledge_card_change', {
        p_card_id: card.id,
        p_reset: false,
      });
      expect(error).not.toBeNull();

      const { data: state } = await admin.from('card_states').select('*').eq('user_id', outsider.id).eq('card_id', card.id);
      expect(state).toHaveLength(0);
    } finally {
      await deleteTestUser(outsider.id);
    }
  });
});

describe('a review does not dismiss a pending content-change flag (AC14 via the apply_review path)', () => {
  it('apply_review keeps the user own seen_version — only acknowledge_card_change moves it (0008)', async () => {
    const deck = await createDeck(owner.id);
    const card = await createCard(deck.id, { front_text: 'v1' });
    const subscriber = await createTestUser('card-version-sub-review');
    try {
      // The subscriber has accepted the original version.
      await createCardState(subscriber.id, card, { seen_version: card.content_version });

      // Author edits the card: content_version bumps, the subscriber's
      // seen_version now lags — this is the "changed since you last accepted
      // it" flag from ADR-002 §8.
      await admin.from('cards').update({ front_text: 'v2' }).eq('id', card.id);
      const { data: bumped } = await admin.from('cards').select('content_version').eq('id', card.id).single();
      expect(bumped!.content_version).toBeGreaterThan(card.content_version);

      // The subscriber reviews the card. Before 0008 the ON CONFLICT branch
      // set seen_version to excluded.seen_version (the card's current version),
      // silently auto-dismissing the flag on the very review that surfaces it.
      const { error } = await subscriber.client.rpc('apply_review', {
        p_card_id: card.id,
        p_rating: 'good',
        p_phase_before: 'review',
        p_elapsed_days: 1,
        p_scheduled_days: 2,
        p_review_stability: 4,
        p_review_difficulty: 5,
        p_lapses: 0,
        p_stability: 5,
        p_difficulty: 5,
        p_phase: 'review',
        p_due_at: new Date().toISOString(),
        p_learning_steps: 0,
        p_elapsed_ms: 1000,
        p_edited_during_review: false,
      });
      expect(error).toBeNull();

      const { data: state } = await admin
        .from('card_states')
        .select('seen_version, reps')
        .eq('user_id', subscriber.id)
        .eq('card_id', card.id)
        .single();
      // The flag is still pending: seen_version is the user's own last-accepted
      // value, not the card's current version.
      expect(state?.seen_version).toBe(card.content_version);
      expect(state?.reps).toBe(1);
    } finally {
      await deleteTestUser(subscriber.id);
    }
  });
});
