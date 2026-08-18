import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  admin,
  createCard,
  createCardState,
  createCourse,
  createDeck,
  createTestUser,
  deleteTestUser,
  type TestUser,
} from '../fixtures/seed';

/*
 * ADR-002 decision 11 (phase 03b): deleting a course auto-forks every
 * subscriber holding review progress, then hard-deletes the course and its
 * decks/cards. The deck-level trigger decks_protect_subscriber_progress (0008)
 * is the proof: after auto-fork no foreign card_state references the course's
 * decks, so the delete passes the guard untouched — and if the fork logic were
 * ever wrong, the delete would fail loudly instead of silently destroying
 * progress. Subscribers with zero progress are not forked.
 */

let owner: TestUser;

beforeAll(async () => {
  owner = await createTestUser('course-delete-owner');
}, 30_000);

afterAll(async () => {
  await deleteTestUser(owner.id);
});

describe('course deletion with auto-fork (decision 11)', () => {
  it('re-points a subscriber\'s progress onto their own copy, then deletes the course', async () => {
    const subscriber = await createTestUser('course-delete-sub-a');

    try {
      const course = await createCourse(owner.id, { visibility: 'public' });
      const deck = await createDeck(owner.id, { course_id: course.id, visibility: 'public' });
      const card = await createCard(deck.id);

      await subscriber.client.rpc('subscribe_to_course', { p_course_id: course.id });
      await createCardState(subscriber.id, { id: card.id, deck_id: deck.id });

      const { error } = await owner.client.rpc('delete_course', { p_course_id: course.id });
      expect(error).toBeNull();

      // The original content is gone.
      const courseCheck = await admin.from('courses').select('id').eq('id', course.id);
      expect(courseCheck.data).toHaveLength(0);
      const deckCheck = await admin.from('decks').select('id').eq('id', deck.id);
      expect(deckCheck.data).toHaveLength(0);
      const cardCheck = await admin.from('cards').select('id').eq('id', card.id);
      expect(cardCheck.data).toHaveLength(0);

      // The subscriber owns one copy, with the same deck/card under it.
      const theirCourse = await admin
        .from('courses')
        .select('id, owner_id, source_course_id')
        .eq('owner_id', subscriber.id);
      expect(theirCourse.data).toHaveLength(1);
      expect(theirCourse.data![0]!.source_course_id).toBeNull(); // source deleted → set null

      const theirDeck = await admin
        .from('decks')
        .select('id')
        .eq('course_id', theirCourse.data![0]!.id);
      expect(theirDeck.data).toHaveLength(1);

      const theirCard = await admin
        .from('cards')
        .select('id')
        .eq('deck_id', theirDeck.data![0]!.id);
      expect(theirCard.data).toHaveLength(1);

      // Their state followed to the copy — card_id AND the denormalised
      // deck_id (queue correctness), seen_version = the copied card's version.
      const theirState = await admin
        .from('card_states')
        .select('card_id, deck_id')
        .eq('user_id', subscriber.id);
      expect(theirState.data).toHaveLength(1);
      expect(theirState.data![0]!.card_id).toBe(theirCard.data![0]!.id);
      expect(theirState.data![0]!.deck_id).toBe(theirDeck.data![0]!.id);
    } finally {
      await deleteTestUser(subscriber.id);
    }
  });

  it('does not fork a subscriber with zero progress — the subscription just drops', async () => {
    const subscriber = await createTestUser('course-delete-sub-b');

    try {
      const course = await createCourse(owner.id, { visibility: 'public' });
      await subscriber.client.rpc('subscribe_to_course', { p_course_id: course.id });

      const before = await admin.from('courses').select('id').eq('owner_id', subscriber.id);

      const { error } = await owner.client.rpc('delete_course', { p_course_id: course.id });
      expect(error).toBeNull();

      // No copy created; subscription row cascaded away with the course.
      const after = await admin.from('courses').select('id').eq('owner_id', subscriber.id);
      expect(after.data).toEqual(before.data);
      const sub = await admin.from('course_subscriptions').select('user_id').eq('user_id', subscriber.id);
      expect(sub.data).toHaveLength(0);
    } finally {
      await deleteTestUser(subscriber.id);
    }
  });

  it('refuses to delete someone else\'s course', async () => {
    const other = await createTestUser('course-delete-other');

    try {
      const course = await createCourse(owner.id, { visibility: 'public' });
      const { error } = await other.client.rpc('delete_course', { p_course_id: course.id });
      expect(error).not.toBeNull();

      const check = await admin.from('courses').select('id').eq('id', course.id);
      expect(check.data).toHaveLength(1);
    } finally {
      await deleteTestUser(other.id);
    }
  });
});
