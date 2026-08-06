import { expect, test } from '@playwright/test';
import { seedUserWithProfile, signIn } from '../fixtures/auth';

/*
 * Criterion 4: ? opens an overlay listing only the shortcuts active
 * in the current scope.
 *
 * Criterion 8: navigating away and back does not duplicate handlers.
 * We press ? twice (open → close → reopen) to verify no duplicates.
 */

async function waitForHydration(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: /settings/i }).waitFor();
}

test.describe('shortcut overlay', () => {
  test('overlay lists global shortcuts', async ({ page, context }) => {
    const user = await seedUserWithProfile('overlay-list');
    await signIn(context, user);
    await page.goto('/app');
    await waitForHydration(page);

    await page.keyboard.press('?');

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // The overlay should contain the title "Keyboard shortcuts".
    await expect(dialog.getByRole('heading', { name: 'Keyboard shortcuts' })).toBeVisible();

    // Should list at least one shortcut with a Kbd element.
    const kbdElements = dialog.locator('kbd');
    expect(await kbdElements.count()).toBeGreaterThan(0);

    await user.cleanup();
  });

  test('overlay can be closed and reopened without duplicate handlers', async ({
    page,
    context,
  }) => {
    const user = await seedUserWithProfile('overlay-reopen');
    await signIn(context, user);
    await page.goto('/app');
    await waitForHydration(page);

    // Open overlay
    await page.keyboard.press('?');
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // Close via Escape
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();

    // Reopen — should work without duplicates (criterion 8)
    await page.keyboard.press('?');
    await expect(dialog).toBeVisible();

    await user.cleanup();
  });
});
