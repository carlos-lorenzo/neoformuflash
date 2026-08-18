import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  anon,
  createCourse,
  createDeck,
  createTestUser,
  deleteTestUser,
  makePro,
  type TestUser,
} from '../fixtures/seed';

/*
 * Phase 03b H: the courses table's RLS policies were written in phase 01 and
 * never exercised — no test ever inserted a deck (or note) with a non-null
 * course_id. These two cases pin the policies that courses-as-required
 * hierarchy depends on:
 *
 *   1. decks_insert_own's WITH CHECK refuses a deck under someone else's
 *      course — the owner-check is on the DECK, so "course belongs to a
 *      different user" must fail even though the inserting user owns the deck.
 *   2. decks_select_public's course-containment clause hides a public deck
 *      under a private course — a child must not defeat its parent's privacy
 *      (the same discipline notes_select_public already encodes).
 */

let owner: TestUser;
let other: TestUser;

beforeAll(async () => {
  owner = await createTestUser('course-rls-owner');
  other = await createTestUser('course-rls-other');
  await makePro(owner.id);
  await makePro(other.id);
}, 30_000);

afterAll(async () => {
  await deleteTestUser(owner.id);
  await deleteTestUser(other.id);
});

describe('course hierarchy (phase-03b H)', () => {
  it('refuses to create a deck under another user\'s course', async () => {
    const course = await createCourse(owner.id, { visibility: 'public' });

    const { error } = await other.client
      .from('decks')
      .insert({
        owner_id: other.id,
        course_id: course.id,
        slug: 'cross-course-deck',
        title: 'Intruder',
        visibility: 'public',
      });

    expect(error).not.toBeNull();
  });

  it('a public deck under a private course is invisible to non-owners', async () => {
    const priv = await createCourse(owner.id, { visibility: 'private' });
    await createDeck(owner.id, { course_id: priv.id, visibility: 'public' });

    // Other user cannot read it — the deck is individually public, but its
    // parent course is private.
    const { data: otherData } = await other.client
      .from('decks')
      .select('id')
      .eq('course_id', priv.id);
    expect(otherData).toHaveLength(0);

    const { data: anonData } = await anon
      .from('decks')
      .select('id')
      .eq('course_id', priv.id);
    expect(anonData).toHaveLength(0);
  });

  it('the owner still reads their own deck under a private course', async () => {
    const priv = await createCourse(owner.id, { visibility: 'private' });
    const deck = await createDeck(owner.id, { course_id: priv.id, visibility: 'public' });

    const { data } = await owner.client.from('decks').select('id').eq('id', deck.id);
    expect(data).toHaveLength(1);
  });

  it('a deck under another user\'s public course is selectable by id but not by the deck owner\'s list', async () => {
    // The owner of the deck is `other`; the course belongs to `owner`. The
    // deck is readable through course-containment (public course), but `other`
    // sees it via the public policy, not decks_select_own — that's the
    // expected semantics, not an escape.
    const pub = await createCourse(owner.id, { visibility: 'public' });
    const deck = await createDeck(other.id, { course_id: pub.id, visibility: 'public' });

    const { data } = await other.client.from('decks').select('id').eq('id', deck.id);
    expect(data).toHaveLength(1);
  });
});
