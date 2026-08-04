import { test, type Page } from '@playwright/test';
import { seedUserWithProfile, seedUserWithoutProfile, signIn } from './fixtures/auth';

/*
 * Capture the surfaces the design-critic reviews against refs/.
 *
 * Three widths × two themes for /login, /onboarding and the /app empty state,
 * exactly as specs/phase-00-foundation.md asks. Output lands in
 * e2e/__screenshots__/<surface>/<theme>/<width>.png, which is the path the
 * verify-ui skill hands to the critic.
 *
 * These make no assertions. They are evidence, and a failing assertion here
 * would stop the evidence being produced.
 */

async function capture(page: Page, surface: string, theme: string, width: number) {
  // Fonts settle after paint; a screenshot taken mid-swap makes the critic
  // report a type problem that does not exist.
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: `e2e/__screenshots__/${surface}/${theme}/${width}.png`,
    fullPage: true,
  });
}

for (const theme of ['dark', 'light'] as const) {
  test.describe(`${theme} screenshots`, () => {
    test.beforeEach(async ({ context }) => {
      await context.addCookies([
        { name: 'theme', value: theme, domain: '127.0.0.1', path: '/' },
      ]);
    });

    test('login', async ({ page }, testInfo) => {
      await page.goto('/login');
      await capture(page, 'login', theme, testInfo.project.use.viewport!.width);
    });

    test('landing', async ({ page }, testInfo) => {
      await page.goto('/');
      await capture(page, 'landing', theme, testInfo.project.use.viewport!.width);
    });

    test('onboarding', async ({ page, context }, testInfo) => {
      const user = await seedUserWithoutProfile(`shot-onboarding-${theme}`);
      await signIn(context, user);

      await page.goto('/onboarding');
      await capture(page, 'onboarding', theme, testInfo.project.use.viewport!.width);

      await user.cleanup();
    });

    test('app empty state', async ({ page, context }, testInfo) => {
      const user = await seedUserWithProfile(`shot-app-${theme}`);
      await signIn(context, user);

      await page.goto('/app');
      await capture(page, 'app-empty', theme, testInfo.project.use.viewport!.width);

      await user.cleanup();
    });
  });
}
