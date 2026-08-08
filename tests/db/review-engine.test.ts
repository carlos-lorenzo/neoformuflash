import { Client } from 'pg';
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
 * Migration 0010 (phase 03). Three objects, each tested against the paths that
 * would fail silently:
 *
 *   1. bump_streak     — the DAY TRANSITIONS, not just "it fired once". A
 *      streak trigger that looks right and is wrong at a boundary is exactly
 *      the shape EVOLUTION keeps recording (green suite, open hole).
 *   2. undo_review     — restores from the review_logs row it deletes, NOT
 *      from the caller's p_prev. The forged-payload case is the reason the
 *      function reads the log at all.
 *   3. cards.confidence — the column-level grant is exactly INSERT+UPDATE for
 *      authenticated and nothing wider.
 *
 * Streak day-transitions are driven by writing review_logs.reviewed_at
 * directly through the admin client: the trigger keys off NEW.reviewed_at::date,
 * so seeding a row dated yesterday is the only way to test "next day extends"
 * without waiting 24 hours or freezing the server clock.
 */

let client: Client;
let owner: TestUser;

/** Insert a review_logs row on a given day, firing review_logs_bump_streak. */
async function logReview(userId: string, cardId: string, reviewedAt: Date) {
  const { error } = await admin.from('review_logs').insert({
    user_id: userId,
    card_id: cardId,
    rating: 'good',
    phase: 'new',
    elapsed_days: 0,
    scheduled_days: 0,
    review_stability: 1,
    review_difficulty: 5,
    reviewed_at: reviewedAt.toISOString(),
  });
  if (error) throw new Error(`could not log review: ${error.message}`);
}

async function readStreak(userId: string) {
  const { data } = await admin
    .from('streaks')
    .select('current_streak, longest_streak, last_active_date')
    .eq('user_id', userId)
    .maybeSingle();
  return data;
}

/** UTC day offset from today, matching the trigger's `reviewed_at::date`. */
function daysAgo(n: number): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d;
}

beforeAll(async () => {
  client = new Client({ connectionString: process.env.SUPABASE_DB_URL! });
  await client.connect();
  owner = await createTestUser('review-engine-owner');
}, 30_000);

afterAll(async () => {
  await deleteTestUser(owner.id);
  await client.end();
});

describe('bump_streak trigger (AC13)', () => {
  /* Each case uses its own user: streaks is keyed by user_id, so sharing one
   * would make the cases order-dependent. */
  async function freshUser(label: string) {
    const user = await createTestUser(label);
    const deck = await createDeck(user.id);
    const card = await createCard(deck.id);
    return { user, card };
  }

  it('the first review of a day creates the streak at 1', async () => {
    const { user, card } = await freshUser('streak-first');
    try {
      expect(await readStreak(user.id)).toBeNull();
      await logReview(user.id, card.id, new Date());

      const streak = await readStreak(user.id);
      expect(streak?.current_streak).toBe(1);
      expect(streak?.longest_streak).toBe(1);
    } finally {
      await deleteTestUser(user.id);
    }
  });

  it('a second review the same day does NOT bump it', async () => {
    const { user, card } = await freshUser('streak-sameday');
    try {
      await logReview(user.id, card.id, new Date());
      await logReview(user.id, card.id, new Date());

      const streak = await readStreak(user.id);
      expect(streak?.current_streak).toBe(1);
      expect(streak?.longest_streak).toBe(1);
    } finally {
      await deleteTestUser(user.id);
    }
  });

  it('reviewing on consecutive days extends the streak', async () => {
    const { user, card } = await freshUser('streak-consecutive');
    try {
      await logReview(user.id, card.id, daysAgo(2));
      await logReview(user.id, card.id, daysAgo(1));
      await logReview(user.id, card.id, daysAgo(0));

      const streak = await readStreak(user.id);
      expect(streak?.current_streak).toBe(3);
      expect(streak?.longest_streak).toBe(3);
    } finally {
      await deleteTestUser(user.id);
    }
  });

  it('a missed day resets current_streak but preserves longest_streak', async () => {
    const { user, card } = await freshUser('streak-gap');
    try {
      // A 3-day run …
      await logReview(user.id, card.id, daysAgo(10));
      await logReview(user.id, card.id, daysAgo(9));
      await logReview(user.id, card.id, daysAgo(8));
      expect((await readStreak(user.id))?.longest_streak).toBe(3);

      // … then a gap, and one review today.
      await logReview(user.id, card.id, daysAgo(0));

      const streak = await readStreak(user.id);
      expect(streak?.current_streak).toBe(1);
      expect(streak?.longest_streak).toBe(3);
    } finally {
      await deleteTestUser(user.id);
    }
  });

  it('longest_streak never decreases when a later run is shorter', async () => {
    const { user, card } = await freshUser('streak-longest');
    try {
      for (const n of [20, 19, 18, 17]) await logReview(user.id, card.id, daysAgo(n));
      expect((await readStreak(user.id))?.longest_streak).toBe(4);

      for (const n of [5, 4]) await logReview(user.id, card.id, daysAgo(n));

      const streak = await readStreak(user.id);
      expect(streak?.current_streak).toBe(2);
      expect(streak?.longest_streak).toBe(4);
    } finally {
      await deleteTestUser(user.id);
    }
  });
});

describe('undo_review (AC9)', () => {
  /** Grade a card through apply_review as the given user. */
  async function grade(
    user: TestUser,
    cardId: string,
    args: {
      rating: 'again' | 'hard' | 'good' | 'easy';
      phaseBefore: 'new' | 'learning' | 'review' | 'relearning';
      reviewStability: number;
      reviewDifficulty: number;
      stability: number;
      difficulty: number;
      phase: 'new' | 'learning' | 'review' | 'relearning';
    }
  ) {
    const { error } = await user.client.rpc('apply_review', {
      p_card_id: cardId,
      p_rating: args.rating,
      p_phase_before: args.phaseBefore,
      p_elapsed_days: 0,
      p_scheduled_days: 0,
      p_review_stability: args.reviewStability,
      p_review_difficulty: args.reviewDifficulty,
      p_lapses: 0,
      p_stability: args.stability,
      p_difficulty: args.difficulty,
      p_phase: args.phase,
      p_due_at: new Date(Date.now() + 600_000).toISOString(),
      p_learning_steps: 1,
      p_elapsed_ms: 4000,
      p_edited_during_review: false,
    });
    if (error) throw new Error(`apply_review failed: ${error.message}`);
  }

  it('undoing a first review removes the card_states row entirely', async () => {
    /* Rows are created lazily on first review, so "before" is no row at all.
     * Restoring one would write the ts-fsrs pre-review difficulty of 0, which
     * violates 0004's `difficulty between 1.0 and 10.0` CHECK. */
    const deck = await createDeck(owner.id);
    const card = await createCard(deck.id);

    await grade(owner, card.id, {
      rating: 'good',
      phaseBefore: 'new',
      reviewStability: 0,
      reviewDifficulty: 0,
      stability: 3.5,
      difficulty: 5.2,
      phase: 'learning',
    });

    const { error } = await owner.client.rpc('undo_review', {
      p_card_id: card.id,
      p_prev: { learningSteps: 0, reps: 0, lapses: 0 },
    });
    expect(error).toBeNull();

    const { data: states } = await admin.from('card_states').select('*').eq('card_id', card.id);
    const { data: logs } = await admin.from('review_logs').select('*').eq('card_id', card.id);
    expect(states).toEqual([]);
    expect(logs).toEqual([]);
  });

  it('restores the pre-review state from the deleted log, ignoring a forged p_prev', async () => {
    const deck = await createDeck(owner.id);
    const card = await createCard(deck.id);

    await grade(owner, card.id, {
      rating: 'good',
      phaseBefore: 'new',
      reviewStability: 0,
      reviewDifficulty: 0,
      stability: 3.5,
      difficulty: 5.2,
      phase: 'learning',
    });
    // Second review: its log carries the TRUE pre-review values (3.5 / 5.2 / learning).
    await grade(owner, card.id, {
      rating: 'easy',
      phaseBefore: 'learning',
      reviewStability: 3.5,
      reviewDifficulty: 5.2,
      stability: 9.9,
      difficulty: 4.1,
      phase: 'review',
    });

    const { error } = await owner.client.rpc('undo_review', {
      p_card_id: card.id,
      // A hostile client claiming a schedule it never had.
      p_prev: { stability: 9999, difficulty: 9.9, phase: 'review', learningSteps: 1, reps: 1, lapses: 0 },
    });
    expect(error).toBeNull();

    const { data: state } = await admin
      .from('card_states')
      .select('stability, difficulty, phase')
      .eq('card_id', card.id)
      .single();
    expect(state?.stability).toBeCloseTo(3.5, 5);
    expect(state?.difficulty).toBeCloseTo(5.2, 5);
    expect(state?.phase).toBe('learning');
  });

  it('deletes exactly one review_logs row — the most recent', async () => {
    const deck = await createDeck(owner.id);
    const card = await createCard(deck.id);

    for (const rating of ['good', 'hard', 'easy'] as const) {
      await grade(owner, card.id, {
        rating,
        phaseBefore: 'learning',
        reviewStability: 3.5,
        reviewDifficulty: 5.2,
        stability: 5,
        difficulty: 5,
        phase: 'learning',
      });
    }

    await owner.client.rpc('undo_review', {
      p_card_id: card.id,
      p_prev: { learningSteps: 1, reps: 2, lapses: 0 },
    });

    const { data: logs } = await admin
      .from('review_logs')
      .select('rating')
      .eq('card_id', card.id)
      .order('reviewed_at', { ascending: true });
    expect(logs?.map((l) => l.rating)).toEqual(['good', 'hard']);
  });

  it('raises when there is nothing to undo', async () => {
    const deck = await createDeck(owner.id);
    const card = await createCard(deck.id);

    const { error } = await owner.client.rpc('undo_review', {
      p_card_id: card.id,
      p_prev: {},
    });
    expect(error).not.toBeNull();
  });

  it("cannot undo another user's review", async () => {
    /* The function scopes every statement to auth.uid(), so a second user
     * calling it against the same card finds no log of their own. */
    const other = await createTestUser('undo-other');
    try {
      const deck = await createDeck(owner.id);
      const card = await createCard(deck.id);
      await grade(owner, card.id, {
        rating: 'good',
        phaseBefore: 'learning',
        reviewStability: 3.5,
        reviewDifficulty: 5.2,
        stability: 5,
        difficulty: 5,
        phase: 'learning',
      });

      const { error } = await other.client.rpc('undo_review', {
        p_card_id: card.id,
        p_prev: { learningSteps: 0, reps: 0, lapses: 0 },
      });
      expect(error).not.toBeNull();

      // The owner's log and state are untouched.
      const { data: logs } = await admin.from('review_logs').select('id').eq('card_id', card.id);
      expect(logs).toHaveLength(1);
    } finally {
      await deleteTestUser(other.id);
    }
  });

  it('is not executable by anon', async () => {
    const { rows } = await client.query<{ grantee: string }>(
      `select grantee from information_schema.routine_privileges
        where routine_name = 'undo_review' and privilege_type = 'EXECUTE'`
    );
    const grantees = rows.map((r) => r.grantee);
    expect(grantees).not.toContain('anon');
    expect(grantees).not.toContain('PUBLIC');
    expect(grantees).toContain('authenticated');
  });
});

describe('cards.confidence grant', () => {
  it('grants authenticated exactly INSERT and UPDATE on the column', async () => {
    const { rows } = await client.query<{ privilege_type: string }>(
      `select privilege_type from information_schema.column_privileges
        where grantee = 'authenticated' and table_schema = 'public'
          and table_name = 'cards' and column_name = 'confidence'
          and privilege_type in ('INSERT', 'UPDATE', 'REFERENCES')`
    );
    expect(rows.map((r) => r.privilege_type).sort()).toEqual(['INSERT', 'REFERENCES', 'UPDATE']);
  });

  it('lets a deck owner set and change confidence', async () => {
    const deck = await createDeck(owner.id);
    const card = await createCard(deck.id, { confidence: 'good' });

    const { error } = await owner.client
      .from('cards')
      .update({ confidence: 'again' })
      .eq('id', card.id);
    expect(error).toBeNull();

    const { data } = await admin
      .from('cards')
      .select('confidence')
      .eq('id', card.id)
      .single();
    expect(data?.confidence).toBe('again');
  });

  it("does not let a non-owner change another user's card confidence", async () => {
    const other = await createTestUser('confidence-other');
    try {
      const deck = await createDeck(owner.id);
      const card = await createCard(deck.id, { confidence: 'good' });

      await other.client.from('cards').update({ confidence: 'easy' }).eq('id', card.id);

      const { data } = await admin
        .from('cards')
        .select('confidence')
        .eq('id', card.id)
        .single();
      expect(data?.confidence).toBe('good');
    } finally {
      await deleteTestUser(other.id);
    }
  });

  it('sorts again < hard < good < easy, the card-list sort key', async () => {
    const deck = await createDeck(owner.id);
    for (const c of ['easy', 'again', 'good', 'hard'] as const) {
      await createCard(deck.id, { confidence: c });
    }

    const { data } = await admin
      .from('cards')
      .select('confidence')
      .eq('deck_id', deck.id)
      .order('confidence', { ascending: true });
    expect(data?.map((r) => r.confidence)).toEqual(['again', 'hard', 'good', 'easy']);
  });
});
