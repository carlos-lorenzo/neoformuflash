import { expect, test, type Page } from '@playwright/test';
import { seedUserWithProfile, signIn, type SeededUser } from '../fixtures/auth';
import { seedDeckWithCards } from '../review/helpers';

/*
 * "Card changed" must not fire on a card the student has never seen.
 *
 * The queue synthesised a state row for every unreviewed card with
 * `seen_version: 1`, then flagged it changed when content_version exceeded
 * that. Editing a card bumps content_version — which is now the ordinary way a
 * deck gets built, since the multi-card editor autosaves — so an author who
 * wrote a deck and then studied it was told, on essentially every card, that
 * "this card was edited by its author while you were reviewing".
 *
 * The dialog itself is not being removed: it is correct for a SUBSCRIBER whose
 * author edits a card between reviews. It just cannot apply before a first
 * review, because there is no earlier version the student saw.
 */

const DIALOG = /Card changed/i;

/*
 * Seed a card_states row via the admin REST client (same pattern as
 * e2e/review/review-interval-reference.spec.ts) so the test controls exactly
 * when a card is due and what seen_version it carries — no dependence on the
 * scheduler's learning re-shows.
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

async function editFirstCard(page: Page, deckId: string, text: string) {
  await page.goto(`/app/decks/${deckId}`);
  await expect(page.locator('ol > li').first()).toBeVisible();

  await page.locator('ol > li').first().getByRole('button', { name: /front/i }).click();
  await expect(page.locator('.ProseMirror')).toHaveCount(2);
  await expect
    .poll(() => page.evaluate(() => Boolean(document.activeElement?.closest('.ProseMirror'))))
    .toBe(true);

  await page.keyboard.press('End');
  await page.keyboard.type(text);
  // Wait for the autosave to land, which is what bumps content_version.
  await expect(page.getByText('Saved').first()).toBeVisible({ timeout: 10_000 });
}

test.describe('review-changed-card', () => {
  let user: SeededUser;
  let deck: Awaited<ReturnType<typeof seedDeckWithCards>>;

  test.beforeEach(async ({ context }) => {
    user = await seedUserWithProfile('changed-card');
    await signIn(context, user);
    deck = await seedDeckWithCards(user.id, 2);
  });

  test.afterEach(async () => {
    await deck.cleanup();
    await user.cleanup();
  });

  test('does not prompt on a card edited before it was ever reviewed', async ({ page }, info) => {
    test.skip(info.project.name === 'mobile-390', 'the editor is read-only below 768');

    await editFirstCard(page, deck.id, ' EDITED BEFORE ANY REVIEW');

    await page.goto(`/app/courses/${deck.courseId}/review/${deck.id}`);

    // The card must simply be presented. Give the dialog a real chance to
    // appear rather than asserting on an empty page.
    await expect(page.getByText(/EDITED BEFORE ANY REVIEW/)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(DIALOG)).toHaveCount(0);
  });

  test('a freshly seeded, unedited deck reviews without the prompt either', async ({ page }) => {
    await page.goto(`/app/courses/${deck.courseId}/review/${deck.id}`);
    await expect(page.getByText(/Front of card/)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(DIALOG)).toHaveCount(0);
  });

  test('the owner is never told their own edit changed a card they reviewed', async ({ page }, info) => {
    test.skip(info.project.name === 'mobile-390', 'the editor is read-only below 768');

    /*
     * The deck owner IS the author. A reviewed card whose seen_version is now
     * behind the content (the author edited it since reviewing) used to fire
     * "this card was edited by its author while you were reviewing" on the
     * author — who did the editing. It must not.
     */
    const now = new Date();
    const lastReviewedAt = new Date(now.getTime() - 48 * 60 * 60 * 1000);
    const dueAt = new Date(now.getTime() - 60 * 1000);
    await seedCardState(user.id, deck.id, deck.cards[0], {
      stability: 2.5,
      difficulty: 5.0,
      phase: 'review',
      learning_steps: 0,
      reps: 3,
      lapses: 0,
      due_at: dueAt.toISOString(),
      last_reviewed_at: lastReviewedAt.toISOString(),
      seen_version: 1,
    });

    // Bumping content_version is what once flagged the card as "changed".
    await editFirstCard(page, deck.id, ' EDITED AFTER REVIEW');

    await page.goto(`/app/courses/${deck.courseId}/review/${deck.id}`);
    await expect(page.getByText(/EDITED AFTER REVIEW/)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(DIALOG)).toHaveCount(0);
  });
});
