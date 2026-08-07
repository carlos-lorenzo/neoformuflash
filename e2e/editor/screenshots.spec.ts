/*
 * Capture the five editor states the design-critic grades against refs/03-editor/:
 *   empty note, prose + inline math, three display equations, save-failed, 390px.
 *
 * Output lands in e2e/__screenshots__/editor-<state>/<theme>/<width>.png.
 * These make no assertions — they are evidence for the critic.
 */

import { test } from '@playwright/test';
import { seedUserWithProfile, signIn } from '../fixtures/auth';
import { editorLocator, seedNote } from './helpers';

async function capture(page: import('@playwright/test').Page, state: string, theme: string, width: number) {
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: `e2e/__screenshots__/${state}/${theme}/${width}.png`,
    fullPage: true,
  });
}

function setup(state: string) {
  test.beforeEach(async ({ context }) => {
    await context.addCookies([{ name: 'theme', value: 'light', domain: '127.0.0.1', path: '/' }]);
  });

  test(`${state}`, async ({ page, context, viewport }, testInfo) => {
    // The editing states need an editable editor; at 390px the editor is
    // read-only (AC10), captured separately as editor-mobile-readonly-view.
    if (state !== 'editor-empty') {
      test.skip((viewport?.width ?? 0) < 768, 'editor states require tablet or wider');
    }
    const user = await seedUserWithProfile(state);
    const note = await seedNote(user.id, state);
    await signIn(context, user);

    await page.goto(`/app/notes/${note.id}`);
    const editor = editorLocator(page);
    const width = testInfo.project.use.viewport!.width;

    if (state === 'editor-prose-math') {
      await editor.click();
      await page.keyboard.type('The integral of a monomial is linear in the summand.');
      await page.keyboard.press('Enter');
      await page.keyboard.type('$');
      await page.keyboard.type('\\');
      await page.getByRole('dialog').locator('input').waitFor();
      await page.getByRole('dialog').locator('input').fill('\\int_a^b f(x)\\,dx');
      await page.keyboard.press('Enter');
      await page.keyboard.type(' follows by linearity.');
    }

    if (state === 'editor-display-equations') {
      await editor.click();
      for (const latex of ['E=mc^2', '\\nabla \\cdot \\mathbf{B} = 0', '\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}']) {
        await page.keyboard.type('$$');
        await page.getByRole('dialog').locator('input').waitFor();
        await page.getByRole('dialog').locator('input').fill(latex);
        await page.keyboard.press('Enter');
        await page.keyboard.press('Enter');
      }
    }

    if (state === 'editor-save-failed') {
      // Abort the autosave POSTs so the save fails, retries, and lands in the
      // error state with a manual retry (AC6).
      await page.route('**/app/notes/**', (route) => {
        if (route.request().method() === 'POST') return route.abort();
        return route.continue();
      });
      await editor.click();
      await page.keyboard.type('This will not save');
      await page.waitForTimeout(1_600);
    }

    await page.waitForTimeout(600); // let KaTeX/paint settle
    await capture(page, state, 'light', width);

    await note.cleanup();
    await user.cleanup();
  });
}

setup('editor-empty');
setup('editor-prose-math');
setup('editor-display-equations');
setup('editor-save-failed');

// The 390px read-only view is mobile-only.
test('editor-mobile-readonly-view', async ({ page, context }, testInfo) => {
  const user = await seedUserWithProfile('mobile-shot');
  const note = await seedNote(user.id, 'Mobile View');
  await signIn(context, user);

  await page.goto(`/app/notes/${note.id}`);
  await page.waitForTimeout(600);
  await capture(page, 'editor-mobile-readonly', 'light', testInfo.project.use.viewport!.width);

  await note.cleanup();
  await user.cleanup();
});
