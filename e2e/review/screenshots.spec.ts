/*
 * Capture the review-session states the design-critic grades against the
 * flashcard + grading-row refs:
 *   review-front    — card face down, hint pulse, counter
 *   review-grading  — revealed back face + grading row with interval previews
 *
 * Output lands in e2e/__screenshots__/<state>/<theme>/<width>.png.
 * These make no assertions — they are evidence for the critic.
 */

import { expect, test } from '@playwright/test';
import { seedUserWithProfile, signIn } from '../fixtures/auth';
import { seedDeckWithCards } from './helpers';

async function capture(
  page: import('@playwright/test').Page,
  state: string,
  theme: string,
  width: number
) {
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: `e2e/__screenshots__/${state}/${theme}/${width}.png`,
    fullPage: true,
  });
}

for (const theme of ['dark', 'light'] as const) {
  test.describe(`${theme} review screenshots`, () => {
    test.beforeEach(async ({ context }) => {
      await context.addCookies([
        { name: 'theme', value: theme, domain: '127.0.0.1', path: '/' },
      ]);
    });

    test('review-front', async ({ page, context }, testInfo) => {
      const user = await seedUserWithProfile(`shot-review-front-${theme}`);
      const deck = await seedDeckWithCards(user.id, 3);
      await signIn(context, user);

      await page.goto(`/app/courses/${deck.courseId}/review/${deck.id}`);
      // Card face loads
      await expect(page.getByText('Front of card 1')).toBeVisible();

      await capture(page, 'review-front', theme, testInfo.project.use.viewport!.width);
      await user.cleanup();
      await deck.cleanup();
    });

    test('review-grading', async ({ page, context }, testInfo) => {
      const user = await seedUserWithProfile(`shot-review-grading-${theme}`);
      const deck = await seedDeckWithCards(user.id, 3);
      await signIn(context, user);

      await page.goto(`/app/courses/${deck.courseId}/review/${deck.id}`);
      await expect(page.getByText('Front of card 1')).toBeVisible();

      // Click the card to reveal the back and surface the grading row.
      await page.getByText('Front of card 1').click();
      await expect(page.getByText('Answer for card 1')).toBeVisible();
      await expect(page.getByRole('group', { name: /grade your recall/i })).toBeVisible();

      await capture(page, 'review-grading', theme, testInfo.project.use.viewport!.width);
      await user.cleanup();
      await deck.cleanup();
    });
  });
}
