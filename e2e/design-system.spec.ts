import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { expectNoHorizontalScroll } from './fixtures/auth';
import { expectVisibleFocusRings } from './fixtures/focus';

/*
 * design-system.md §9: "Written rules are hopes. Items 1–5 are the actual
 * guarantee." Items 1 (token lint) and 4 (screenshots) live elsewhere. Items 2,
 * 3 and 5 — contrast, reduced motion and focus — are here.
 *
 * These run against the public surfaces, which need no session. The authed
 * surfaces are covered in auth.spec.ts.
 */

const PUBLIC_PAGES = ['/', '/login'] as const;
const THEMES = ['dark', 'light'] as const;

async function setTheme(page: Page, theme: 'dark' | 'light') {
  await page.context().addCookies([
    { name: 'theme', value: theme, domain: '127.0.0.1', path: '/' },
  ]);
}

for (const theme of THEMES) {
  test.describe(`${theme} mode`, () => {
    test.beforeEach(async ({ page }) => {
      await setTheme(page, theme);
    });

    for (const path of PUBLIC_PAGES) {
      test(`${path} has zero axe violations (AC 7, §9.2)`, async ({ page }) => {
        await page.goto(path);
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);

        const results = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
          .analyze();

        // Print the rule ids rather than the whole blob — a 400-line dump is
        // why people stop reading accessibility failures.
        expect(
          results.violations.map((v) => `${v.id} (${v.nodes.length})`),
          JSON.stringify(results.violations.map((v) => ({ id: v.id, help: v.help })), null, 2)
        ).toEqual([]);
      });

      test(`${path} shows a visible focus ring on every control (AC 7, §9.5)`, async ({ page }) => {
        await page.goto(path);
        await expectVisibleFocusRings(page, `${path} (${theme})`);
      });
    }
  });
}

test.describe('reduced motion (§9.3)', () => {
  test('no transition or animation exceeds 1ms', async ({ page }) => {
    // `page.emulateMedia`, not `test.use({ reducedMotion })`. The fixture form
    // did not take effect here and the test passed against un-emulated CSS —
    // it reported a real failure for the wrong reason, and would just as easily
    // have reported a pass for the wrong reason.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/login');

    // Assert the emulation actually applied, so this can never again grade
    // a page that was never in reduced-motion mode.
    const emulated = await page.evaluate(
      () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
    );
    expect(emulated, 'reduced-motion emulation did not apply').toBe(true);

    const offenders = await page.evaluate(() => {
      const toMs = (value: string) =>
        value.trim().endsWith('ms')
          ? Number.parseFloat(value)
          : Number.parseFloat(value) * 1000;

      const bad: string[] = [];

      for (const element of Array.from(document.querySelectorAll('*'))) {
        const style = getComputedStyle(element);

        for (const [property, raw] of [
          ['transition-duration', style.transitionDuration],
          ['animation-duration', style.animationDuration],
        ] as const) {
          for (const part of raw.split(',')) {
            const ms = toMs(part);
            if (Number.isFinite(ms) && ms > 1) {
              bad.push(`${element.tagName.toLowerCase()}: ${property} ${part.trim()}`);
            }
          }
        }
      }

      return bad;
    });

    expect(offenders, offenders.slice(0, 10).join('\n')).toEqual([]);
  });
});

test.describe('390px layout (AC 6)', () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) !== 390, 'mobile width only');

  for (const path of PUBLIC_PAGES) {
    test(`${path} has no horizontal scroll and no target under 44px`, async ({ page }) => {
      await page.goto(path);
      await expectNoHorizontalScroll(page);

      const targets = page.locator('a[href], button');
      const count = await targets.count();

      for (let index = 0; index < count; index += 1) {
        const target = targets.nth(index);
        if (!(await target.isVisible())) continue;

        const box = await target.boundingBox();
        if (!box) continue;

        expect(
          Math.round(box.height),
          `target ${index} on ${path} is ${Math.round(box.height)}px tall`
        ).toBeGreaterThanOrEqual(44);
      }
    });
  }
});
