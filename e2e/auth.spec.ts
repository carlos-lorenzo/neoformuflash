import { expect, test } from '@playwright/test';
import {
  expectNoHorizontalScroll,
  seedUserWithProfile,
  seedUserWithoutProfile,
  signIn,
  type SeededUser,
} from './fixtures/auth';

/*
 * The auth flows named in specs/phase-00-foundation.md:
 * auth-signup, auth-returning, auth-signout.
 */

test.describe('auth-signup', () => {
  let user: SeededUser;

  test.beforeEach(async ({ context }) => {
    user = await seedUserWithoutProfile('signup');
    await signIn(context, user);
  });

  test.afterEach(async () => {
    await user.cleanup();
  });

  test('a new user is sent to onboarding and lands on the dashboard (AC 1)', async ({ page }) => {
    // A signed-in user with no profile row belongs in onboarding, wherever
    // in the app they point their browser.
    await page.goto('/app');
    await expect(page).toHaveURL(/\/onboarding$/);

    // The display name is pre-filled from the Google account.
    const nameField = page.getByRole('textbox').first();
    await expect(nameField).toHaveValue('José Martínez-Peña');

    await page.getByRole('combobox').first().click();
    await page.getByRole('option', { name: /Universitat Politècnica de València/ }).click();

    await page.getByRole('button', { name: /Get started|Empezar/ }).click();

    await expect(page).toHaveURL(/\/app$/);
    await expect(page.getByRole('heading', { level: 2 })).toBeVisible();
  });

  test('onboarding has no horizontal scroll and reachable targets', async ({ page }) => {
    await page.goto('/onboarding');
    await expectNoHorizontalScroll(page);
  });
});

test.describe('auth-returning', () => {
  let user: SeededUser;

  test.beforeEach(async ({ context }) => {
    user = await seedUserWithProfile('returning');
    await signIn(context, user);
  });

  test.afterEach(async () => {
    await user.cleanup();
  });

  test('goes straight to the dashboard, never seeing onboarding (AC 2)', async ({ page }) => {
    await page.goto('/app');
    await expect(page).toHaveURL(/\/app$/);
  });

  test('is redirected away from onboarding once a profile exists', async ({ page }) => {
    await page.goto('/onboarding');
    await expect(page).toHaveURL(/\/app$/);
  });

  test('is redirected away from the sign-in page', async ({ page }) => {
    await page.goto('/login');
    await expect(page).toHaveURL(/\/app$/);
  });
});

test.describe('auth-signout', () => {
  test('clears the session, and /app then redirects to /login (AC 3)', async ({ page, context }) => {
    const user = await seedUserWithProfile('signout');
    await signIn(context, user);

    await page.goto('/app');
    await expect(page).toHaveURL(/\/app$/);

    // Language, theme and sign-out live behind one settings control — three
    // inline controls did not fit the 48px header at 390px.
    await page.getByRole('button', { name: /Settings|Ajustes/ }).click();
    await page.getByRole('button', { name: /Sign out|Salir/ }).click();
    await expect(page).toHaveURL(/\/login$/);

    // The real assertion: the session is gone, not merely navigated away from.
    await page.goto('/app');
    await expect(page).toHaveURL(/\/login$/);

    await user.cleanup();
  });
});

test.describe('dashboard empty state', () => {
  test('names what goes there and offers exactly one action (AC 8)', async ({ page, context }) => {
    /*
     * AC 8 was the only acceptance criterion with no mechanical check — it was
     * covered by a screenshot and the design-critic's reading of it. A
     * screenshot proves what it looked like on one run; it does not stop a
     * second button appearing here in phase 02.
     *
     * "Exactly one action" is the part worth guarding. §7 rejects the empty
     * state that turns into a menu, and that regression arrives by addition,
     * which is precisely what a count catches and a picture does not.
     */
    const user = await seedUserWithProfile('empty-state');
    await signIn(context, user);
    await page.goto('/app');

    const heading = page.getByRole('heading', { level: 2 });
    await expect(heading).toBeVisible();
    // Names what goes here, rather than reporting an absence ("No notes yet").
    await expect(heading).not.toHaveText(/^no\s/i);

    // The action is a link, not a button (navigates to /app/notes)
    const actions = page.getByRole('main').getByRole('link');
    await expect(actions).toHaveCount(1);
    await expect(actions.first()).toBeEnabled();

    await user.cleanup();
  });
});

test.describe('guards', () => {
  test('an anonymous visitor cannot reach /app or /onboarding', async ({ page }) => {
    await page.goto('/app');
    await expect(page).toHaveURL(/\/login$/);

    await page.goto('/onboarding');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('an anonymous visitor cannot bypass the guard with an asset extension', async ({
    request,
  }) => {
    /*
     * The proxy matcher used to exclude every path ending in an image or font
     * extension, so `/app/x.png` never reached `updateSession`. Nothing under
     * `/app/` renders today without the layout's own check, so this was not
     * exploitable — but phase 01 adds routes there, and a matcher hole is not
     * something to rediscover later.
     *
     * Asserted at the HTTP layer rather than via page.goto: the point is the
     * response the middleware produces, and a 404 would also "not be /app".
     */
    for (const path of ['/app/x.png', '/app/nested/y.woff2', '/onboarding/z.svg']) {
      const response = await request.get(path, { maxRedirects: 0 });
      expect(response.status(), `${path} should be redirected by the middleware`).toBe(307);
      expect(response.headers()['location']).toContain('/login');
    }
  });

  test('the landing page and sign-in page are public', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    await page.goto('/login');
    await expect(page.getByRole('button', { name: /Google/ })).toBeVisible();
  });
});
