import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  admin,
  anon,
  createCard,
  createCourse,
  createDeck,
  createNote,
  createTestUser,
  deleteTestUser,
  makePro,
  type TestUser,
} from '../fixtures/seed';

/*
 * AC 4, 7, 12, 15 — the visibility matrix across courses/notes/decks/cards for
 * owner, other user and anon; private-requires-pro; the database (not the app)
 * refusing to fork or subscribe to a private target; slug immutability.
 *
 * "unlisted is readable by anyone holding the id" is an application-level
 * convention (lib/db/* never lists unlisted rows) — RLS itself cannot
 * distinguish a lookup-by-id from a listing query, so what the database
 * actually guarantees, and what this suite asserts, is that unlisted rows are
 * selectable at all by a non-owner while private rows are not.
 */

let owner: TestUser;
let other: TestUser;

beforeAll(async () => {
  owner = await createTestUser('content-owner');
  other = await createTestUser('content-other');
}, 30_000);

afterAll(async () => {
  await deleteTestUser(owner.id);
  await deleteTestUser(other.id);
});

describe('courses visibility (AC4)', () => {
  it('owner reads own row regardless of visibility', async () => {
    await makePro(owner.id);
    const priv = await createCourse(owner.id, { visibility: 'private' });

    const { data } = await owner.client.from('courses').select('id').eq('id', priv.id);
    expect(data).toHaveLength(1);
  });

  it('anon and another user can read a public course', async () => {
    const pub = await createCourse(owner.id, { visibility: 'public' });

    const { data: anonData } = await anon.from('courses').select('id').eq('id', pub.id);
    expect(anonData).toHaveLength(1);

    const { data: otherData } = await other.client.from('courses').select('id').eq('id', pub.id);
    expect(otherData).toHaveLength(1);
  });

  it('anon and another user can read an unlisted course by id', async () => {
    const unlisted = await createCourse(owner.id, { visibility: 'unlisted' });

    const { data: anonData } = await anon.from('courses').select('id').eq('id', unlisted.id);
    expect(anonData).toHaveLength(1);

    const { data: otherData } = await other.client.from('courses').select('id').eq('id', unlisted.id);
    expect(otherData).toHaveLength(1);
  });

  it('anon and another user cannot read a private course', async () => {
    await makePro(owner.id);
    const priv = await createCourse(owner.id, { visibility: 'private' });

    const { data: anonData } = await anon.from('courses').select('id').eq('id', priv.id);
    expect(anonData).toHaveLength(0);

    const { data: otherData } = await other.client.from('courses').select('id').eq('id', priv.id);
    expect(otherData).toHaveLength(0);
  });

  it('a soft-deleted course is invisible to non-owners', async () => {
    const pub = await createCourse(owner.id, { visibility: 'public' });
    await admin.from('courses').update({ deleted_at: new Date().toISOString() }).eq('id', pub.id);

    const { data } = await other.client.from('courses').select('id').eq('id', pub.id);
    expect(data).toHaveLength(0);
  });
});

describe('notes visibility (AC4)', () => {
  it('owner reads own private note; others and anon cannot', async () => {
    const note = await createNote(owner.id, { visibility: 'private' });

    const { data: ownerData } = await owner.client.from('notes').select('id').eq('id', note.id);
    expect(ownerData).toHaveLength(1);

    const { data: otherData } = await other.client.from('notes').select('id').eq('id', note.id);
    expect(otherData).toHaveLength(0);

    const { data: anonData } = await anon.from('notes').select('id').eq('id', note.id);
    expect(anonData).toHaveLength(0);
  });

  it('a published public note is readable by anon; an unlisted one is readable by id', async () => {
    const pub = await createNote(owner.id, { visibility: 'public', published_at: new Date().toISOString() });
    const unlisted = await createNote(owner.id, { visibility: 'unlisted' });

    const { data: pubData } = await anon.from('notes').select('id').eq('id', pub.id);
    expect(pubData).toHaveLength(1);

    const { data: unlistedData } = await anon.from('notes').select('id').eq('id', unlisted.id);
    expect(unlistedData).toHaveLength(1);
  });

  it('an unpublished draft note (visibility=public, published_at=null) is not readable by anon or another user', async () => {
    const draft = await createNote(owner.id, { visibility: 'public', published_at: null });

    const { data: anonData } = await anon.from('notes').select('id').eq('id', draft.id);
    expect(anonData).toHaveLength(0);

    const { data: otherData } = await other.client.from('notes').select('id').eq('id', draft.id);
    expect(otherData).toHaveLength(0);

    const { data: ownerData } = await owner.client.from('notes').select('id').eq('id', draft.id);
    expect(ownerData).toHaveLength(1);
  });

  it('a note inside a private course is not readable even if the note itself is public', async () => {
    await makePro(owner.id);
    const course = await createCourse(owner.id, { visibility: 'private' });
    const note = await createNote(owner.id, {
      course_id: course.id,
      visibility: 'public',
      published_at: new Date().toISOString(),
    });

    const { data: anonData } = await anon.from('notes').select('id').eq('id', note.id);
    expect(anonData).toHaveLength(0);

    const { data: otherData } = await other.client.from('notes').select('id').eq('id', note.id);
    expect(otherData).toHaveLength(0);
  });

  it('a user cannot insert a note into a course they do not own', async () => {
    await makePro(owner.id);
    const course = await createCourse(owner.id, { visibility: 'public' });

    const { data: inserted, error } = await other.client
      .from('notes')
      .insert({ owner_id: other.id, course_id: course.id, slug: `x-${Date.now()}`, title: 'x', visibility: 'public' })
      .select('id');
    // RLS WITH CHECK rejects the row — the insert errors and returns no row.
    expect(inserted).toBeNull();
    expect(error).not.toBeNull();
  });
});

describe('decks visibility (AC4)', () => {
  it('follows the same owner/other/anon matrix as courses and notes', async () => {
    const priv = await createDeck(owner.id, { visibility: 'private' });

    const { data: ownerData } = await owner.client.from('decks').select('id').eq('id', priv.id);
    expect(ownerData).toHaveLength(1);

    const { data: otherData } = await other.client.from('decks').select('id').eq('id', priv.id);
    expect(otherData).toHaveLength(0);

    const { data: anonData } = await anon.from('decks').select('id').eq('id', priv.id);
    expect(anonData).toHaveLength(0);
  });

  it('a deck inside a private course is not readable even if the deck itself is public', async () => {
    await makePro(owner.id);
    const course = await createCourse(owner.id, { visibility: 'private' });
    const deck = await createDeck(owner.id, { course_id: course.id, visibility: 'public' });

    const { data: anonData } = await anon.from('decks').select('id').eq('id', deck.id);
    expect(anonData).toHaveLength(0);

    const { data: otherData } = await other.client.from('decks').select('id').eq('id', deck.id);
    expect(otherData).toHaveLength(0);
  });

  it('a user cannot insert a deck into a course they do not own', async () => {
    await makePro(owner.id);
    const course = await createCourse(owner.id, { visibility: 'public' });

    const { data: inserted, error } = await other.client
      .from('decks')
      .insert({ owner_id: other.id, course_id: course.id, slug: `x-${Date.now()}`, title: 'x', visibility: 'public' })
      .select('id');
    // RLS WITH CHECK rejects the row — the insert errors and returns no row.
    expect(inserted).toBeNull();
    expect(error).not.toBeNull();
  });
});

describe('cards visibility (AC4)', () => {
  it('inherits visibility from the owning deck, never a column of its own', async () => {
    const privDeck = await createDeck(owner.id, { visibility: 'private' });
    const privCard = await createCard(privDeck.id);

    const pubDeck = await createDeck(owner.id, { visibility: 'public' });
    const pubCard = await createCard(pubDeck.id);

    const { data: privData } = await other.client.from('cards').select('id').eq('id', privCard.id);
    expect(privData).toHaveLength(0);

    const { data: pubData } = await anon.from('cards').select('id').eq('id', pubCard.id);
    expect(pubData).toHaveLength(1);
  });

  it('a card under a public deck inside a private course is not readable', async () => {
    await makePro(owner.id);
    const course = await createCourse(owner.id, { visibility: 'private' });
    const deck = await createDeck(owner.id, { course_id: course.id, visibility: 'public' });
    const card = await createCard(deck.id);

    const { data: anonData } = await anon.from('cards').select('id').eq('id', card.id);
    expect(anonData).toHaveLength(0);

    const { data: otherData } = await other.client.from('cards').select('id').eq('id', card.id);
    expect(otherData).toHaveLength(0);
  });
});

describe('private requires pro (AC7)', () => {
  let free: TestUser;

  beforeAll(async () => {
    free = await createTestUser('content-free');
  }, 30_000);

  afterAll(async () => {
    await deleteTestUser(free.id);
  });

  it('a free user cannot create a private course', async () => {
    const { error } = await free.client
      .from('courses')
      .insert({ owner_id: free.id, slug: `free-priv-course-${Date.now()}`, name: 'x', visibility: 'private' });
    expect(error).not.toBeNull();
  });

  it('a free user cannot flip an existing public course to private', async () => {
    const course = await createCourse(free.id, { visibility: 'public' });
    const { error } = await free.client.from('courses').update({ visibility: 'private' }).eq('id', course.id);
    expect(error).not.toBeNull();

    const { data } = await admin.from('courses').select('visibility').eq('id', course.id).single();
    expect(data?.visibility).toBe('public');
  });

  it('a free user cannot create a private note or deck', async () => {
    const { error: noteError } = await free.client
      .from('notes')
      .insert({ owner_id: free.id, slug: `free-priv-note-${Date.now()}`, title: 'x', visibility: 'private' });
    expect(noteError).not.toBeNull();

    const { error: deckError } = await free.client
      .from('decks')
      .insert({ owner_id: free.id, slug: `free-priv-deck-${Date.now()}`, title: 'x', visibility: 'private' });
    expect(deckError).not.toBeNull();
  });

  it('a pro user can create and update to private', async () => {
    await makePro(free.id);
    const course = await createCourse(free.id, { visibility: 'public' });
    const { error } = await free.client.from('courses').update({ visibility: 'private' }).eq('id', course.id);
    expect(error).toBeNull();
  });
});

describe('forking/subscribing a private target fails at the database (AC12)', () => {
  let proOwner: TestUser;
  let subscriber: TestUser;

  beforeAll(async () => {
    proOwner = await createTestUser('content-pro-owner');
    subscriber = await createTestUser('content-subscriber');
    await makePro(proOwner.id);
  }, 30_000);

  afterAll(async () => {
    await deleteTestUser(proOwner.id);
    await deleteTestUser(subscriber.id);
  });

  it('subscribe_to_course rejects a private course', async () => {
    const course = await createCourse(proOwner.id, { visibility: 'private' });
    const { error } = await subscriber.client.rpc('subscribe_to_course', { p_course_id: course.id });
    expect(error).not.toBeNull();
  });

  it('subscribe_to_deck rejects a private deck', async () => {
    const deck = await createDeck(proOwner.id, { visibility: 'private' });
    const { error } = await subscriber.client.rpc('subscribe_to_deck', { p_deck_id: deck.id });
    expect(error).not.toBeNull();
  });

  it('fork_course rejects a private course', async () => {
    const course = await createCourse(proOwner.id, { visibility: 'private' });
    const { error } = await subscriber.client.rpc('fork_course', { p_course_id: course.id });
    expect(error).not.toBeNull();
  });

  it('fork_deck rejects a private deck', async () => {
    const deck = await createDeck(proOwner.id, { visibility: 'private' });
    const { error } = await subscriber.client.rpc('fork_deck', { p_deck_id: deck.id });
    expect(error).not.toBeNull();
  });
});

describe('slug immutability (AC15)', () => {
  it('rejects a slug change on courses; name updates freely', async () => {
    const course = await createCourse(owner.id);
    const { error } = await admin.from('courses').update({ slug: 'renamed' }).eq('id', course.id);
    expect(error?.message).toContain('slug is immutable');

    const { error: nameError } = await owner.client.from('courses').update({ name: 'New Name' }).eq('id', course.id);
    expect(nameError).toBeNull();
  });

  it('rejects a slug change on a published note; title updates freely', async () => {
    const note = await createNote(owner.id, { published_at: new Date().toISOString() });
    const { error } = await admin.from('notes').update({ slug: 'renamed' }).eq('id', note.id);
    expect(error?.message).toContain('slug is immutable');

    const { error: titleError } = await owner.client.from('notes').update({ title: 'New Title' }).eq('id', note.id);
    expect(titleError).toBeNull();
  });

  it('allows a slug change on a draft (unpublished) note', async () => {
    const note = await createNote(owner.id, { published_at: null });
    const { error } = await admin.from('notes').update({ slug: 'draft-renamed' }).eq('id', note.id);
    expect(error).toBeNull();
  });

  it('rejects a slug change on decks', async () => {
    const deck = await createDeck(owner.id);
    const { error } = await admin.from('decks').update({ slug: 'renamed' }).eq('id', deck.id);
    expect(error?.message).toContain('slug is immutable');
  });
});
