/*
 * AC9: a note with 5,000 words and 40 equations stays responsive; typing
 * latency stays under 50ms.
 *
 * The exact figure is measured in-browser (keydown → next frame) and is noisy
 * on CI; this test keeps the assertion but treats a local run as the source of
 * truth. The load-not-frozen check is the part that always runs.
 */

import { expect, test } from '@playwright/test';
import { seedUserWithProfile, signIn } from '../fixtures/auth';
import { editorLocator, largeDoc, seedNote } from './helpers';

test.describe('editor-large-document-perf', () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) < 768, 'editor requires tablet or wider');

  test('loads a 5000-word / 40-equation note without freezing', async ({ page, context }) => {
    const user = await seedUserWithProfile('perf');
    const note = await seedNote(user.id, 'Perf', largeDoc());
    await signIn(context, user);

    const started = Date.now();
    await page.goto(`/app/notes/${note.id}`);
    const editor = editorLocator(page);
    await editor.waitFor({ state: 'visible' });

    // Mount + render should not take an unreasonable wall-clock time.
    expect(Date.now() - started).toBeLessThan(15_000);

    // A keystroke round-trips in-browser within the 50ms budget.
    await editor.click();
    const latency = await page.evaluate(async () => {
      const ed = document.querySelector('.ProseMirror') as HTMLElement | null;
      if (!ed) return -1;
      ed.focus();
      const before = performance.now();
      ed.dispatchEvent(new KeyboardEvent('keydown', { key: 'x', bubbles: true }));
      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
      return performance.now() - before;
    });

    expect(latency).toBeGreaterThanOrEqual(0);
    expect(latency).toBeLessThan(50);

    await note.cleanup();
    await user.cleanup();
  });
});
