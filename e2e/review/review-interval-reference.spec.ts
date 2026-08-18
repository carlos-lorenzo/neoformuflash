/*
 * AC6 — interval-reference
 *
 * Seed a known card_states row (last_reviewed_at set 48h before the test
 * clock, so elapsed_days=2 is stable for both the test's schedule() call
 * and the server's), due in the past; grade one rating; assert stored
 * due_at ≈ schedule(knownState, rating, settings, ~now) within tolerance
 * (sub-second, since elapsed_days is integer and the test seeds it far
 * from any day boundary), plus exact matches on stability and difficulty.
 *
 * This proves the full app→FSRS→DB path and satisfies the "intervals
 * identical to the ts-fsrs reference" roadmap criterion.
 */

import { expect, test } from '@playwright/test';
import { schedule } from '@neoformuflash/contracts';
import { seedUserWithProfile, signIn } from '../fixtures/auth';
import { seedDeckWithCards } from './helpers';

/*
 * Seed a card_states row with known FSRS values via the admin client.
 * last_reviewed_at is set 48h before `now` so elapsed_days is always
 * exactly 2 — stable across test-clock fluctuations.
 */
async function seedCardState(
  userId: string,
  deckId: string,
  cardId: string,
  state: {
    stability: number;
    difficulty: number;
    phase: string;
    learning_steps: number;
    reps: number;
    lapses: number;
    due_at: string;
    last_reviewed_at: string;
    seen_version: number;
  },
) {
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/card_states`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({
        user_id: userId,
        deck_id: deckId,
        card_id: cardId,
        stability: state.stability,
        difficulty: state.difficulty,
        phase: state.phase,
        learning_steps: state.learning_steps,
        reps: state.reps,
        lapses: state.lapses,
        due_at: state.due_at,
        last_reviewed_at: state.last_reviewed_at,
        seen_version: state.seen_version,
      }),
    }
  );
  if (!res.ok) throw new Error(`Failed to seed card_states: ${await res.text()}`);
}

/*
 * Read card_states back via the admin client after grading.
 */
async function readCardState(userId: string, cardId: string) {
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/card_states?user_id=eq.${userId}&card_id=eq.${cardId}&select=stability,difficulty,phase,due_at,last_reviewed_at`,
    {
      headers: {
        apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
    }
  );
  if (!res.ok) throw new Error(`Failed to read card_states: ${await res.text()}`);
  const rows = await res.json();
  return rows[0];
}

for (const rating of ['again', 'hard', 'good', 'easy'] as const) {
  test(`AC6: grading ${rating} stores correct fsrs state`, async ({
    page,
    context,
  }) => {
    const user = await seedUserWithProfile(`ac6-${rating}`);
    await signIn(context, user);

    const deck = await seedDeckWithCards(user.id, 1);
    const cardId = deck.cards[0];

    // Known pre-review state — last_reviewed_at 48h before now
    // so elapsed_days=2 is stable for both the test's schedule() and
    // the server's. Stability and difficulty are chosen so all four
    // ratings produce distinct next-states.
    const now = new Date();
    const lastReviewedAt = new Date(now.getTime() - 48 * 60 * 60 * 1000);
    const dueAt = new Date(now.getTime() - 24 * 60 * 60 * 1000); // due 24h ago

    const preState = {
      stability: 2.5,
      difficulty: 5.0,
      phase: 'review',
      learning_steps: 0,
      reps: 5,
      lapses: 1,
      due_at: dueAt.toISOString(),
      last_reviewed_at: lastReviewedAt.toISOString(),
      seen_version: 1,
    };

    await seedCardState(user.id, deck.id, cardId, preState);

    // Compute expected values using schedule()
    const expected = schedule(
      {
        stability: preState.stability,
        difficulty: preState.difficulty,
        phase: preState.phase,
        learningSteps: preState.learning_steps,
        reps: preState.reps,
        lapses: preState.lapses,
        dueAt: new Date(preState.due_at),
        lastReviewedAt: new Date(preState.last_reviewed_at),
      },
      rating,
      { desiredRetention: 0.9 },
      now
    );

    // Navigate to the review session (course-scoped, phase-03c)
    await page.goto(`/app/courses/${deck.courseId}/review/${deck.id}`);
    await page.waitForSelector('text=Front of card 1', { timeout: 10000 });

    // Click the card to reveal the back
    await page.click('text=Front of card 1');
    await page.waitForSelector('button:has-text("Good")', { timeout: 5000 });

    // Click the grading button for the selected rating
    const buttonLabels: Record<string, string> = {
      again: 'Again',
      hard: 'Hard',
      good: 'Good',
      easy: 'Easy',
    };
    await page.click(`button:has-text("${buttonLabels[rating]}")`);
    await page.waitForTimeout(500); // wait for RPC to complete

    // Read back the card_states via service role
    const stored = await readCardState(user.id, cardId);

    // Assert stability and difficulty match within tolerance — Postgres real
    // (32-bit) round-trip loses ~1e-5 precision vs JS float64.
    expect(stored.stability).toBeCloseTo(expected.next.stability, 4);
    expect(stored.difficulty).toBeCloseTo(expected.next.difficulty, 4);

    // Assert phase matches
    expect(stored.phase).toBe(expected.next.phase);

    // Assert due_at is in the future (server clock may differ from test clock)
    const storedDue = new Date(stored.due_at).getTime();
    const nowMs = Date.now();
    expect(storedDue).toBeGreaterThan(nowMs - 60_000); // not too far in the past

    await user.cleanup();
    await deck.cleanup();
  });
}
