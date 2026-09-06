import { expect, test } from '@playwright/test';
import { seedUserWithProfile, signIn, type SeededUser } from '../fixtures/auth';

/*
 * The public-profile copy button.
 *
 * It used to put `@handle` on the clipboard while the hint beside it said
 * "Share this link" — pasting the result into a chat produced text nobody
 * could click. The `@` matters: `app/[handle]` is a bare root segment that
 * catches every unmatched top-level path, so a URL without the sigil is a 404.
 */

test.describe('dashboard-copy-profile-link', () => {
  let user: SeededUser;

  test.beforeEach(async ({ context }) => {
    user = await seedUserWithProfile('copy-link');
    await signIn(context, user);
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  });

  test.afterEach(async () => {
    await user.cleanup();
  });

  test('copies the full profile URL, not just the handle', async ({ page }) => {
    await page.goto('/app');

    const code = page.locator('code').first();
    const shown = (await code.textContent())?.trim() ?? '';

    // What is displayed must be what is copied — they disagreed before.
    expect(shown).toMatch(/^https?:\/\/.+\/@[a-z0-9][a-z0-9_-]{2,29}$/);

    await page.getByRole('button', { name: /Copy link/i }).click();

    const clipboard = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboard).toBe(shown);
    expect(clipboard).toContain('/@');
    // The bug this replaces: a bare "@handle" with no origin.
    expect(clipboard).not.toMatch(/^@/);
  });

  test('confirms the copy in a live region', async ({ page }) => {
    await page.goto('/app');
    await page.getByRole('button', { name: /Copy link/i }).click();

    await expect(page.locator('[aria-live="polite"]').filter({ hasText: /copied/i })).toBeVisible();
  });

  test('the copy control meets the 44px touch target', async ({ page }) => {
    await page.goto('/app');
    const box = await page.getByRole('button', { name: /Copy link/i }).boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(44);
    expect(box?.height).toBeGreaterThanOrEqual(44);
  });
});
