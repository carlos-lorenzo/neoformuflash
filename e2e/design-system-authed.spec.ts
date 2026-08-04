import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import {
  expectNoHorizontalScroll,
  seedUserWithProfile,
  seedUserWithoutProfile,
  signIn,
} from './fixtures/auth';
import { expectVisibleFocusRings } from './fixtures/focus';

/*
 * The same §9 guarantees as design-system.spec.ts, but on the surfaces that
 * need a session.
 *
 * AC 7 names /onboarding explicitly and AC 10 asks for the pseudo-locale pass
 * across the app, so testing only the public pages would leave the two screens
 * with the most controls unchecked — which is where focus and overflow
 * problems actually live.
 */

const SURFACES = [
  { name: 'onboarding', path: '/onboarding', seed: seedUserWithoutProfile },
  { name: 'app', path: '/app', seed: seedUserWithProfile },
] as const;

/*
 * AC 6: at 390px every target is at least 44px. Both dimensions, not just
 * height — the first version of this check measured height alone, which a
 * 20px-wide icon button passes while being unusable with a thumb.
 */
async function expectTargetsAtLeast44(page: Page, label: string): Promise<void> {
  const targets = page.locator('a[href], button');
  const count = await targets.count();

  const undersized: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const target = targets.nth(index);
    if (!(await target.isVisible())) continue;

    const box = await target.boundingBox();
    if (!box) continue;

    if (Math.round(box.width) < 44 || Math.round(box.height) < 44) {
      const name =
        (await target.textContent())?.trim() || (await target.getAttribute('aria-label')) || 'icon';
      undersized.push(`${name}: ${Math.round(box.width)}×${Math.round(box.height)}`);
    }
  }

  expect(undersized, `undersized targets on ${label}:\n${undersized.join('\n')}`).toEqual([]);
}

for (const theme of ['dark', 'light'] as const) {
  for (const surface of SURFACES) {
    test(`${surface.name} has zero axe violations in ${theme} mode`, async ({ page, context }) => {
      await context.addCookies([
        { name: 'theme', value: theme, domain: '127.0.0.1', path: '/' },
      ]);
      const user = await surface.seed(`axe-${surface.name}-${theme}`);
      await signIn(context, user);
      await page.goto(surface.path);

      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();

      expect(
        results.violations.map((v) => `${v.id} (${v.nodes.length})`),
        JSON.stringify(
          results.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.html) })),
          null,
          2
        )
      ).toEqual([]);

      await user.cleanup();
    });
  }
}

for (const surface of SURFACES) {
  test(`${surface.name} shows a visible focus ring on every control (AC 7)`, async ({
    page,
    context,
  }) => {
    const user = await surface.seed(`focus-${surface.name}`);
    await signIn(context, user);
    await page.goto(surface.path);

    await expectVisibleFocusRings(page, surface.path);

    await user.cleanup();
  });
}

test.describe('390px authed layout', () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) !== 390, 'mobile width only');

  test('the settings dialog has no target under 44px (AC 6)', async ({ page, context }) => {
    /*
     * The open state, which nothing measured until now.
     *
     * AC 6 covers the shell at 390px, and the settings dialog is part of it —
     * but every check ran against the closed page, where the dialog's controls
     * are not in the DOM. The theme segmented control was 54×32 and the close
     * button 32×32 the whole time, and the suite could not see either, because
     * it only ever looked at the state that happened to be rendered.
     *
     * The lesson is about coverage, not about these two controls: a state that
     * no test opens is a state no test checks.
     */
    const user = await seedUserWithProfile('mobile-settings');
    await signIn(context, user);
    await page.goto('/app');

    await page.getByRole('button', { name: /settings/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    await expectTargetsAtLeast44(page, '/app with the settings dialog open');
    await expectNoHorizontalScroll(page);

    await user.cleanup();
  });

  for (const surface of SURFACES) {
    test(`${surface.name}: no horizontal scroll, no target under 44px (AC 6)`, async ({
      page,
      context,
    }) => {
      const user = await surface.seed(`mobile-${surface.name}`);
      await signIn(context, user);
      await page.goto(surface.path);

      await expectNoHorizontalScroll(page);
      await expectTargetsAtLeast44(page, surface.path);

      await user.cleanup();
    });

    test(`${surface.name}: pseudo-locale shows no overflow or truncation (AC 10)`, async ({
      page,
      context,
    }) => {
      await context.addCookies([
        { name: 'locale', value: 'pseudo', domain: '127.0.0.1', path: '/' },
      ]);
      const user = await surface.seed(`pseudo-${surface.name}`);
      await signIn(context, user);
      await page.goto(surface.path);

      await expectNoHorizontalScroll(page);

      const problems = await page.evaluate(() => {
        const bad: string[] = [];
        for (const element of Array.from(
          document.querySelectorAll('h1, h2, h3, p, button, a, label, span')
        )) {
          if (element.children.length > 0) continue; // leaf text nodes only
          const text = element.textContent ?? '';
          if (element.scrollWidth > element.clientWidth + 1) {
            bad.push(`clipped: ${text.slice(0, 40)}`);
          }
        }
        return bad;
      });

      expect(problems, problems.join('\n')).toEqual([]);

      await user.cleanup();
    });
  }
});
