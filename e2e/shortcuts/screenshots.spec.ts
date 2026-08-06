import { test, type Page } from '@playwright/test';
import { seedUserWithProfile, signIn } from '../fixtures/auth';

/*
 * Capture screenshots of the shortcut overlay and sidebar with hints
 * for design-critic review against refs/.
 *
 * Output lands in e2e/__screenshots__/<surface>/<theme>/<width>.png.
 */

async function waitForHydration(page: Page) {
  await page.getByRole('button', { name: /settings/i }).waitFor();
}

async function capture(page: Page, surface: string, theme: string, width: number) {
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: `e2e/__screenshots__/${surface}/${theme}/${width}.png`,
    fullPage: true,
  });
}

for (const theme of ['dark', 'light'] as const) {
  test.describe(`${theme} shortcut screenshots`, () => {
    test.beforeEach(async ({ context }) => {
      await context.addCookies([
        { name: 'theme', value: theme, domain: '127.0.0.1', path: '/' },
      ]);
    });

    test('shortcut overlay', async ({ page, context }, testInfo) => {
      const user = await seedUserWithProfile(`shot-overlay-${theme}`);
      await signIn(context, user);

      await page.goto('/app');
      await waitForHydration(page);

      await page.keyboard.press('?');
      const dialog = page.getByRole('dialog');
      await dialog.waitFor({ state: 'visible' });

      await capture(page, 'shortcut-overlay', theme, testInfo.project.use.viewport!.width);

      await user.cleanup();
    });
  });
}
