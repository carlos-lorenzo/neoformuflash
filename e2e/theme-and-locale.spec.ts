import { expect, test } from '@playwright/test';
import { expectNoHorizontalScroll } from './fixtures/auth';

/*
 * Flows theme-toggle and shell-mobile, plus the pseudo-locale pass (AC 10).
 */

test.describe('theme-toggle', () => {
  test('dark is the default (§0)', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });

  test('the choice persists across reloads with no flash of the wrong theme (AC 5)', async ({
    page,
    context,
  }) => {
    await context.addCookies([
      { name: 'theme', value: 'light', domain: '127.0.0.1', path: '/' },
    ]);

    await page.goto('/login');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  });

  test('the attribute is present in the server HTML, not patched in afterwards', async ({
    request,
  }) => {
    /*
     * This is the actual anti-flash assertion. Checking the DOM after load
     * cannot distinguish "server-rendered correctly" from "corrected by
     * JavaScript a moment after the wrong colours painted" — which is exactly
     * the bug. So: read the raw HTML the server sent.
     */
    const response = await request.get('/login', {
      headers: { cookie: 'theme=light' },
    });
    const html = await response.text();

    expect(html).toContain('data-theme="light"');
  });

  test('light and dark are different materials, not an inversion (§0)', async ({
    page,
    context,
  }) => {
    await page.goto('/login');
    const darkBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);

    await context.addCookies([
      { name: 'theme', value: 'light', domain: '127.0.0.1', path: '/' },
    ]);
    await page.reload();
    const lightBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);

    expect(darkBg).not.toBe(lightBg);
  });
});

test.describe('locale', () => {
  test('an es-ES browser gets Spanish with no profile (AC 1c)', async ({ browser }) => {
    const context = await browser.newContext({ locale: 'es-ES' });
    const page = await context.newPage();

    await page.goto('/login');
    await expect(page.locator('html')).toHaveAttribute('lang', 'es');

    await context.close();
  });

  test('an en-GB browser gets English', async ({ browser }) => {
    const context = await browser.newContext({ locale: 'en-GB' });
    const page = await context.newPage();

    await page.goto('/login');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');

    await context.close();
  });

  test('an unsupported browser language falls back to English', async ({ browser }) => {
    const context = await browser.newContext({ locale: 'de-DE' });
    const page = await context.newPage();

    await page.goto('/login');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');

    await context.close();
  });

  test('a stored choice overrides the browser header', async ({ browser }) => {
    const context = await browser.newContext({ locale: 'es-ES' });
    await context.addCookies([{ name: 'locale', value: 'en', domain: '127.0.0.1', path: '/' }]);
    const page = await context.newPage();

    await page.goto('/login');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');

    await context.close();
  });

  test('public URLs are never locale-prefixed (decision 7)', async ({ browser }) => {
    // Switching interface language must not change the address of a page.
    // A /es/ prefix appearing here is an SEO regression that is hard to undo
    // once Google has indexed both copies.
    const context = await browser.newContext({ locale: 'es-ES' });
    const page = await context.newPage();

    const response = await page.goto('/login');
    expect(response?.url()).toMatch(/\/login$/);
    expect(page.url()).not.toContain('/es/');

    await context.close();
  });
});

test.describe('shell-mobile', () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) !== 390, 'mobile width only');

  test('no horizontal scroll at 390px (AC 6)', async ({ page }) => {
    for (const path of ['/', '/login']) {
      await page.goto(path);
      await expectNoHorizontalScroll(page);
    }
  });

  test('the pseudo-locale pass shows no overflow or truncation (AC 10)', async ({ context }) => {
    /*
     * Every string 40% longer than English. German and Catalan run this much
     * longer in practice, so a layout that only ever saw English breaks the
     * first time a real translation lands. This finds it in CI instead.
     */
    await context.addCookies([
      { name: 'locale', value: 'pseudo', domain: '127.0.0.1', path: '/' },
    ]);
    const page = await context.newPage();

    for (const path of ['/', '/login']) {
      await page.goto(path);
      await expectNoHorizontalScroll(page);

      // Truncation check: the pseudo-locale wraps each string in brackets, so a
      // missing closing bracket means the text was cut off rather than wrapped.
      const truncated = await page.evaluate(() => {
        const bad: string[] = [];
        for (const element of Array.from(document.querySelectorAll('h1, h2, p, button, a, label'))) {
          const text = element.textContent ?? '';
          if (text.includes('[') && !text.includes(']')) bad.push(text.slice(0, 40));

          // clientWidth < scrollWidth on a text node means it is being clipped.
          if (element.scrollWidth > element.clientWidth + 1) {
            bad.push(`clipped: ${text.slice(0, 40)}`);
          }
        }
        return bad;
      });

      expect(truncated, truncated.join('\n')).toEqual([]);
    }
  });
});
