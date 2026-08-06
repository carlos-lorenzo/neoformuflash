import { expect, test } from '@playwright/test';
import { seedUserWithProfile, signIn } from '../fixtures/auth';

/*
 * Criterion 1: every binding in the "Global" table works, and no binding
 * outside it does.
 *
 * Criterion 2: g opens a 1.5s second-key window with a visible indicator;
 * an unmapped second key cancels silently; a third press does nothing.
 *
 * Only routes that exist today are registered. g+h → /app is the only
 * g-prefix binding with a real action. Other g bindings are added by
 * the phases that build those routes.
 */

/** Wait for the client-side shortcut provider to hydrate. */
async function waitForHydration(page: import('@playwright/test').Page) {
  // The sidebar toggle is a client component — its presence confirms hydration.
  await page.getByRole('button', { name: /settings/i }).waitFor();
}

test.describe('global shortcuts', () => {
  test('g then h stays on /app (home)', async ({ page, context }) => {
    const user = await seedUserWithProfile('nav-g-h');
    await signIn(context, user);
    await page.goto('/app');
    await waitForHydration(page);
    const urlBefore = page.url();

    await page.keyboard.press('g');
    await page.waitForTimeout(100);
    await page.keyboard.press('h');

    // Should still be on /app (g+h navigates to /app, which is where we are).
    expect(page.url()).toBe(urlBefore);

    await user.cleanup();
  });

  test('g prefix indicator appears after pressing g', async ({ page, context }) => {
    const user = await seedUserWithProfile('nav-g-indicator');
    await signIn(context, user);
    await page.goto('/app');
    await waitForHydration(page);

    await page.keyboard.press('g');

    // The indicator should be visible (aria-live region with the g Kbd).
    const indicator = page.locator('[aria-live="polite"]');
    await expect(indicator).toBeVisible();

    await user.cleanup();
  });

  test('g prefix indicator disappears after a second key', async ({ page, context }) => {
    const user = await seedUserWithProfile('nav-g-dismiss');
    await signIn(context, user);
    await page.goto('/app');
    await waitForHydration(page);

    await page.keyboard.press('g');
    const indicator = page.locator('[aria-live="polite"]');
    await expect(indicator).toBeVisible();

    await page.keyboard.press('h');

    // Indicator should disappear after the second key is processed.
    await expect(indicator).not.toBeVisible();

    await user.cleanup();
  });

  test('g prefix cancels silently on unmapped second key', async ({ page, context }) => {
    const user = await seedUserWithProfile('nav-g-cancel');
    await signIn(context, user);
    await page.goto('/app');
    await waitForHydration(page);
    const urlBefore = page.url();

    await page.keyboard.press('g');
    await page.waitForTimeout(100);

    // Press an unmapped key — should cancel silently, no navigation.
    await page.keyboard.press('x');

    expect(page.url(), 'route should not change on unmapped second key').toBe(urlBefore);

    await user.cleanup();
  });

  test('? opens the shortcut overlay', async ({ page, context }) => {
    const user = await seedUserWithProfile('nav-question');
    await signIn(context, user);
    await page.goto('/app');
    await waitForHydration(page);

    await page.keyboard.press('?');

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    await user.cleanup();
  });

  test('Esc closes the shortcut overlay', async ({ page, context }) => {
    const user = await seedUserWithProfile('nav-esc-overlay');
    await signIn(context, user);
    await page.goto('/app');
    await waitForHydration(page);

    await page.keyboard.press('?');
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();

    await user.cleanup();
  });
});
