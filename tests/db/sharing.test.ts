import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  admin,
  createCard,
  createCardState,
  createCourse,
  createDeck,
  createNote,
  createTestUser,
  makePro,
  deleteTestUser,
  type TestUser,
} from '../fixtures/seed';

/*
 * AC 8, 9, 10, 11 — subscribe idempotence and counters, a subscriber tracking
 * later edits while a forker does not, fork lineage, and the highest-risk
 * assertion in this phase: a user's progress survives forking row-for-row.
 *
 * AC10 is written and run against the real fork_course/fork_deck procedures
 * (0005_sharing.sql) rather than mocked — this is exactly the assertion the
 * spec calls out as most likely to be silently wrong.
 */

let proOwner: TestUser;
let subscriber: TestUser;

beforeAll(async () => {
  proOwner = await createTestUser('sharing-pro-owner');
  subscriber = await createTestUser('sharing-subscriber');
  await makePro(proOwner.id);
}, 30_000);

afterAll(async () => {
  await deleteTestUser(proOwner.id);
  await deleteTestUser(subscriber.id);
});

describe('subscribe idempotence and counters (AC8)', () => {
  it('subscribing twice to a course does not double-count; unsubscribing restores it', async () => {
    const course = await createCourse(proOwner.id, { visibility: 'public' });

    const first = await subscriber.client.rpc('subscribe_to_course', { p_course_id: course.id });
    expect(first.error).toBeNull();
    const second = await subscriber.client.rpc('subscribe_to_course', { p_course_id: course.id });
    expect(second.error).toBeNull();

    const { data: rows } = await admin
      .from('course_subscriptions')
      .select('user_id')
      .eq('course_id', course.id)
      .eq('user_id', subscriber.id);
    expect(rows).toHaveLength(1);

    const { data: afterSub } = await admin.from('courses').select('subscriber_count').eq('id', course.id).single();
    expect(afterSub?.subscriber_count).toBe(1);

    const { error: unsubError } = await subscriber.client
      .from('course_subscriptions')
      .delete()
      .eq('course_id', course.id);
    expect(unsubError).toBeNull();

    const { data: afterUnsub } = await admin.from('courses').select('subscriber_count').eq('id', course.id).single();
    expect(afterUnsub?.subscriber_count).toBe(0);
  });

  it('subscribing twice to a deck does not double-count; unsubscribing restores it', async () => {
    const deck = await createDeck(proOwner.id, { visibility: 'public' });

    await subscriber.client.rpc('subscribe_to_deck', { p_deck_id: deck.id });
    const { error } = await subscriber.client.rpc('subscribe_to_deck', { p_deck_id: deck.id });
    expect(error).toBeNull();

    const { data: afterSub } = await admin.from('decks').select('subscriber_count').eq('id', deck.id).single();
    expect(afterSub?.subscriber_count).toBe(1);

    await subscriber.client.from('deck_subscriptions').delete().eq('deck_id', deck.id);

    const { data: afterUnsub } = await admin.from('decks').select('subscriber_count').eq('id', deck.id).single();
    expect(afterUnsub?.subscriber_count).toBe(0);
  });
});

describe('subscriber tracks edits; forker does not (AC9)', () => {
  it('a subscriber sees a later edit to a note without acting; a forker keeps their snapshot', async () => {
    const course = await createCourse(proOwner.id, { visibility: 'public' });
    const note = await createNote(proOwner.id, {
      course_id: course.id,
      visibility: 'public',
      title: 'v1',
      published_at: new Date().toISOString(),
    });

    await subscriber.client.rpc('subscribe_to_course', { p_course_id: course.id });

    const forker = await createTestUser('sharing-forker');
    try {
      const { data: forkResult, error: forkError } = await forker.client.rpc('fork_course', {
        p_course_id: course.id,
      });
      expect(forkError).toBeNull();
      const forkedCourseId = forkResult?.course_id;
      expect(forkedCourseId).not.toBeNull();

      await admin.from('notes').update({ title: 'v2' }).eq('id', note.id);

      const { data: subscriberView } = await subscriber.client.from('notes').select('title').eq('id', note.id).single();
      expect(subscriberView?.title).toBe('v2');

      const { data: forkedNotes } = await admin
        .from('notes')
        .select('title')
        .eq('course_id', forkedCourseId!)
        .eq('source_note_id', note.id);
      expect(forkedNotes).toHaveLength(1);
      expect(forkedNotes?.[0]?.title).toBe('v1');
    } finally {
      await deleteTestUser(forker.id);
    }
  });
});

describe('progress survives a fork row-for-row (AC10)', () => {
  it('fork_deck carries stability, difficulty, due_at and lapses to the new card, pointed at the new deck', async () => {
    const deck = await createDeck(proOwner.id, { visibility: 'public' });
    const card = await createCard(deck.id);

    // Representative of ~90 days of accumulated review history on this card.
    const dueAt = new Date('2026-05-01T00:00:00.000Z').toISOString();
    const lastReviewedAt = new Date('2026-04-20T00:00:00.000Z').toISOString();
    await createCardState(subscriber.id, card, {
      stability: 15.234,
      difficulty: 6.789,
      phase: 'review',
      learning_steps: 0,
      reps: 42,
      lapses: 3,
      seen_version: 1,
      due_at: dueAt,
      last_reviewed_at: lastReviewedAt,
    });

    const { data: forkResult, error } = await subscriber.client.rpc('fork_deck', { p_deck_id: deck.id });
    expect(error).toBeNull();
    expect(forkResult?.states_carried).toBe(1);
    expect(forkResult?.deck_id).not.toBeNull();

    const { data: newCard } = await admin.from('cards').select('id').eq('source_card_id', card.id).single();
    expect(newCard).not.toBeNull();

    const { data: newState } = await admin
      .from('card_states')
      .select('*')
      .eq('user_id', subscriber.id)
      .eq('card_id', newCard!.id)
      .single();

    expect(newState).not.toBeNull();
    expect(newState?.deck_id).toBe(forkResult!.deck_id);
    expect(newState?.stability).toBeCloseTo(15.234, 5);
    expect(newState?.difficulty).toBeCloseTo(6.789, 5);
    expect(newState?.phase).toBe('review');
    expect(newState?.reps).toBe(42);
    expect(newState?.lapses).toBe(3);
    expect(new Date(newState!.due_at!).getTime()).toBe(new Date(dueAt).getTime());

    // The old card_state row is re-pointed in place (same user_id/card_id
    // primary key semantics would collide otherwise) — it no longer exists
    // under the OLD card_id once repointed to the new one.
    const { data: oldState } = await admin
      .from('card_states')
      .select('card_id')
      .eq('user_id', subscriber.id)
      .eq('card_id', card.id);
    expect(oldState).toHaveLength(0);
  });

  it('fork_deck carries content_version to the new card so seen_version stays in sync and does not falsely flag', async () => {
    const deck = await createDeck(proOwner.id, { visibility: 'public' });
    const card = await createCard(deck.id, { front_text: 'v1' });

    // Edit the source card a few times before forking, bumping content_version
    // past the table default of 1.
    await admin.from('cards').update({ front_text: 'v2' }).eq('id', card.id);
    await admin.from('cards').update({ front_text: 'v3' }).eq('id', card.id);
    const { data: sourceBeforeFork } = await admin
      .from('cards')
      .select('content_version')
      .eq('id', card.id)
      .single();
    expect(sourceBeforeFork!.content_version).toBeGreaterThan(1);

    await createCardState(subscriber.id, card, { seen_version: sourceBeforeFork!.content_version });

    const { error } = await subscriber.client.rpc('fork_deck', { p_deck_id: deck.id });
    expect(error).toBeNull();

    const { data: newCard } = await admin
      .from('cards')
      .select('id, content_version')
      .eq('source_card_id', card.id)
      .single();
    const { data: newState } = await admin
      .from('card_states')
      .select('seen_version')
      .eq('user_id', subscriber.id)
      .eq('card_id', newCard!.id)
      .single();

    // The new card must start at the source's content_version, not the table
    // default of 1 — otherwise seen_version (copied from the source) would
    // permanently outrun content_version and future edits would never flag.
    expect(newCard!.content_version).toBe(sourceBeforeFork!.content_version);
    expect(newState!.seen_version).toBe(newCard!.content_version);
  });

  it('fork_course carries progress across the whole tree, matched through source_card_id', async () => {
    const course = await createCourse(proOwner.id, { visibility: 'public' });
    const deck = await createDeck(proOwner.id, { course_id: course.id, visibility: 'public' });
    const card = await createCard(deck.id);

    const dueAt = new Date('2026-06-15T00:00:00.000Z').toISOString();
    await createCardState(subscriber.id, card, {
      stability: 8.5,
      difficulty: 4.2,
      phase: 'review',
      reps: 20,
      lapses: 1,
      due_at: dueAt,
    });

    const { data: forkResult, error } = await subscriber.client.rpc('fork_course', { p_course_id: course.id });
    expect(error).toBeNull();
    expect(forkResult?.states_carried).toBe(1);

    const { data: newCard } = await admin.from('cards').select('id, deck_id').eq('source_card_id', card.id).single();
    const { data: newDeck } = await admin.from('decks').select('id').eq('source_deck_id', deck.id).single();
    expect(newCard?.deck_id).toBe(newDeck?.id);

    const { data: newState } = await admin
      .from('card_states')
      .select('*')
      .eq('user_id', subscriber.id)
      .eq('card_id', newCard!.id)
      .single();
    expect(newState?.deck_id).toBe(newDeck?.id);
    expect(newState?.stability).toBeCloseTo(8.5, 5);
    expect(newState?.lapses).toBe(1);
    expect(new Date(newState!.due_at!).getTime()).toBe(new Date(dueAt).getTime());
  });
});

describe('forking cancels subscriptions and moves counters (AC11)', () => {
  it('forking a course cancels the course subscription and any deck subscriptions under it', async () => {
    const course = await createCourse(proOwner.id, { visibility: 'public' });
    const deck = await createDeck(proOwner.id, { course_id: course.id, visibility: 'public' });

    await subscriber.client.rpc('subscribe_to_course', { p_course_id: course.id });
    await subscriber.client.rpc('subscribe_to_deck', { p_deck_id: deck.id });

    const { data: beforeCourse } = await admin.from('courses').select('subscriber_count').eq('id', course.id).single();
    expect(beforeCourse?.subscriber_count).toBe(1);

    const { error } = await subscriber.client.rpc('fork_course', { p_course_id: course.id });
    expect(error).toBeNull();

    const { data: courseSub } = await admin
      .from('course_subscriptions')
      .select('user_id')
      .eq('course_id', course.id)
      .eq('user_id', subscriber.id);
    expect(courseSub).toHaveLength(0);

    const { data: deckSub } = await admin
      .from('deck_subscriptions')
      .select('user_id')
      .eq('deck_id', deck.id)
      .eq('user_id', subscriber.id);
    expect(deckSub).toHaveLength(0);

    const { data: afterCourse } = await admin.from('courses').select('subscriber_count, fork_count').eq('id', course.id).single();
    expect(afterCourse?.subscriber_count).toBe(0);
    expect(afterCourse?.fork_count).toBe(1);
  });

  it('forking a deck cancels the deck subscription and bumps fork_count', async () => {
    const deck = await createDeck(proOwner.id, { visibility: 'public' });

    await subscriber.client.rpc('subscribe_to_deck', { p_deck_id: deck.id });

    const { error } = await subscriber.client.rpc('fork_deck', { p_deck_id: deck.id });
    expect(error).toBeNull();

    const { data: deckSub } = await admin
      .from('deck_subscriptions')
      .select('user_id')
      .eq('deck_id', deck.id)
      .eq('user_id', subscriber.id);
    expect(deckSub).toHaveLength(0);

    const { data: afterDeck } = await admin.from('decks').select('subscriber_count, fork_count').eq('id', deck.id).single();
    expect(afterDeck?.subscriber_count).toBe(0);
    expect(afterDeck?.fork_count).toBe(1);
  });
});

describe('fork_course skips private sub-objects (AC12)', () => {
  let forker: TestUser;

  beforeAll(async () => {
    forker = await createTestUser('sharing-forker-pv');
  }, 30_000);

  afterAll(async () => {
    await deleteTestUser(forker.id);
  });

  it('private notes and decks inside a public course are not copied', async () => {
    const course = await createCourse(proOwner.id, { visibility: 'public' });
    await createNote(proOwner.id, { course_id: course.id, title: 'public-note', visibility: 'public' });
    await createNote(proOwner.id, { course_id: course.id, title: 'private-note', visibility: 'private' });

    const publicDeck = await createDeck(proOwner.id, { course_id: course.id, visibility: 'public', title: 'public-deck' });
    await createCard(publicDeck.id, { front_text: 'pub-front', back_text: 'pub-back' });
    const privateDeck = await createDeck(proOwner.id, { course_id: course.id, visibility: 'private' });
    await createCard(privateDeck.id, { front_text: 'priv-front', back_text: 'priv-back' });

    const { data: forkResult, error } = await forker.client.rpc('fork_course', { p_course_id: course.id });
    expect(error).toBeNull();
    const forkedCourseId = forkResult!.course_id!;

    const { data: forkedNotes } = await admin
      .from('notes')
      .select('title, visibility')
      .eq('course_id', forkedCourseId)
      .order('title');
    expect(forkedNotes).toHaveLength(1);
    expect(forkedNotes?.[0]?.title).toBe('public-note');

    const { data: forkedDecks } = await admin
      .from('decks')
      .select('title, visibility')
      .eq('course_id', forkedCourseId);
    expect(forkedDecks).toHaveLength(1);
    expect(forkedDecks?.[0]?.title).toBe('public-deck');
  });
});
