import { describe, expect, it } from 'vitest';
import { CardInput, UpdateCardInput, CreateCourseInput, UpdateCourseInput } from './schemas';
import type { NoteDoc } from './content';

/*
 * Phase 03 additions only. The rest of schemas.ts is exercised through the
 * suites that consume it (signup, notes) — this file covers the card
 * confidence field and the new update input, per the phase-03 spec.
 * Phase 03b adds the course inputs: a contracts change with no migration
 * (every table, policy, FK and grant courses needs already exists in 0003).
 */

const doc: NoteDoc = { type: 'doc', content: [] };

// Real v4 UUIDs: z.uuid() enforces the version and variant nibbles, so
// '2222…'-style placeholders fail on format before any field logic runs.
const DECK_ID = '86c36ab6-a387-4a48-aeee-4c51471571cb';
const CARD_ID = '04437728-f8d6-4be1-8700-6642972ec513';

const validCard = {
  deckId: DECK_ID,
  frontJson: doc,
  backJson: doc,
  frontText: 'front',
  backText: 'back',
  position: 0,
  confidence: 'good' as const,
};

describe('CardInput.confidence', () => {
  it('accepts each value of the review_rating scale', () => {
    for (const confidence of ['again', 'hard', 'good', 'easy'] as const) {
      const parsed = CardInput.parse({ ...validCard, confidence });
      expect(parsed.confidence).toBe(confidence);
    }
  });

  it('accepts null — the column is nullable and NULL means unset', () => {
    expect(CardInput.parse({ ...validCard, confidence: null }).confidence).toBeNull();
  });

  it('rejects a value outside the scale', () => {
    expect(CardInput.safeParse({ ...validCard, confidence: 'medium' }).success).toBe(false);
  });

  it('requires the field to be present — the caller must decide, not default silently', () => {
    const { confidence: _omitted, ...withoutConfidence } = validCard;
    expect(CardInput.safeParse(withoutConfidence).success).toBe(false);
  });
});

describe('UpdateCardInput', () => {
  const ids = { id: CARD_ID, deckId: DECK_ID };

  it('accepts id + deckId alone: every content field is optional', () => {
    expect(UpdateCardInput.safeParse(ids).success).toBe(true);
  });

  it('accepts confidence alone — the card editor changing only the hint', () => {
    const parsed = UpdateCardInput.parse({ ...ids, confidence: 'hard' });
    expect(parsed.confidence).toBe('hard');
  });

  it('accepts front/back alone — the inline-edit path during review', () => {
    const parsed = UpdateCardInput.parse({
      ...ids,
      frontJson: doc,
      backJson: doc,
      frontText: 'edited',
      backText: 'edited back',
    });
    expect(parsed.frontText).toBe('edited');
    expect(parsed.confidence).toBeUndefined();
  });

  it('distinguishes an explicit null confidence from an omitted one', () => {
    expect(UpdateCardInput.parse({ ...ids, confidence: null }).confidence).toBeNull();
    expect('confidence' in UpdateCardInput.parse(ids)).toBe(false);
  });

  it('requires both ids: an update targets one row inside one deck', () => {
    expect(UpdateCardInput.safeParse({ id: ids.id }).success).toBe(false);
    expect(UpdateCardInput.safeParse({ deckId: ids.deckId }).success).toBe(false);
  });

  it('rejects a malformed id with a stable catalog code, never prose', () => {
    const result = UpdateCardInput.safeParse({ ...ids, id: 'not-a-uuid' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe('content.card.invalid');
    }
  });

  it('has no contentVersion field — that column is trigger-owned (ADR-002 §8)', () => {
    const parsed = UpdateCardInput.parse({ ...ids, contentVersion: 99 });
    expect('contentVersion' in parsed).toBe(false);
  });
});

describe('CreateCourseInput', () => {
  const valid = { name: 'Calculus II', language: 'es', visibility: 'public' };

  it('accepts name + language + visibility', () => {
    expect(CreateCourseInput.safeParse(valid).success).toBe(true);
  });

  it('accepts optional code / institution / degree', () => {
    const parsed = CreateCourseInput.safeParse({
      ...valid,
      code: 'MAT-202',
      institutionId: '86c36ab6-a387-4a48-aeee-4c51471571cb',
      degreeId: '04437728-f8d6-4be1-8700-6642972ec513',
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects a blank name with a stable catalog code', () => {
    const result = CreateCourseInput.safeParse({ ...valid, name: '  ' });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]?.message).toBe('content.course.nameRequired');
  });

  it('rejects a malformed institution id, never prose', () => {
    const result = CreateCourseInput.safeParse({ ...valid, institutionId: 'nope' });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]?.message).toBe('content.course.institutionInvalid');
  });
});

describe('UpdateCourseInput', () => {
  it('accepts id alone: every field is optional', () => {
    expect(UpdateCourseInput.safeParse({ id: '86c36ab6-a387-4a48-aeee-4c51471571cb' }).success).toBe(true);
  });

  it('allows clearing code to null', () => {
    const parsed = UpdateCourseInput.parse({
      id: '86c36ab6-a387-4a48-aeee-4c51471571cb',
      code: null,
    });
    expect(parsed.code).toBeNull();
  });

  it('rejects a missing id', () => {
    expect(UpdateCourseInput.safeParse({ name: 'X' }).success).toBe(false);
  });
});
