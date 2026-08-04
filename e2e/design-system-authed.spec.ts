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

  test('the settings dialog is centred while animating, not only after', async ({
    page,
    context,
  }) => {
    /*
     * The teleport bug: the panel opened at roughly −100%/−100% (one full
     * width left and one full height up from centre) and snapped into place
     * when the 200ms animation ended.
     *
     * Root cause: Tailwind v4 compiles `-translate-x/y-1/2` to the `translate`
     * shorthand, while the keyframe animated `transform: translate(-50%,-50%)`.
     * Those are separate CSS properties that compose — during the animation
     * both applied, so the total offset was double what it should have been.
     *
     * This test catches that specific failure by sampling the panel's position
     * *mid-animation*. A test that only asserts the final position passes
     * against the bug — the panel does end up centred, just not until it jumps.
     *
     * Reduced motion is explicitly NOT emulated here; the whole point is that
     * the animation's mid-state is correct. Under reduced motion, --dur-base
     * collapses to 1ms and the panel would settle instantly, certifying
     * nothing about the actual animation.
     */
    const user = await seedUserWithProfile('dialog-centre');
    await signIn(context, user);
    await page.goto('/app');

    // Open the dialog and grab its position immediately, before the animation
    // has time to settle. The 200ms duration is long enough that a single
    // rAF-level check catches it mid-flight; polling would be flakier.
    await page.getByRole('button', { name: /settings/i }).click();

    const dialog = page.getByRole('dialog');
    await dialog.waitFor({ state: 'visible' });

    // Sample mid-animation: the panel should already be centred. The viewport
    // is 390×844, so centre is (195, 422). Allow 20px tolerance for subpixel
    // rounding and timing — the bug manifested as a ~200px+ offset, not noise.
    const box = await dialog.boundingBox();
    expect(box, 'dialog bounding box while animating').not.toBeNull();

    const viewport = page.viewportSize()!;
    const centreX = viewport.width / 2;
    const centreY = viewport.height / 2;
    // The dialog's centre, not its top-left corner.
    const dialogCentreX = box!.x + box!.width / 2;
    const dialogCentreY = box!.y + box!.height / 2;

    expect(
      Math.abs(dialogCentreX - centreX),
      `dialog x-centre (${dialogCentreX.toFixed(0)}) should match viewport centre (${centreX})`
    ).toBeLessThan(20);
    expect(
      Math.abs(dialogCentreY - centreY),
      `dialog y-centre (${dialogCentreY.toFixed(0)}) should match viewport centre (${centreY})`
    ).toBeLessThan(20);

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
