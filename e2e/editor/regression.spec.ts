/*
 * Regression coverage for post-merge editor fixes:
 *   1. slash-menu block items actually apply (heading, bullet list) and focus
 *      returns to the editor so the next keystrokes land in the document;
 *   2. the slash menu offers Equation as an alternative to `$$` (AC2);
 *   3. the shortcut provider no longer enters its render loop — the editor
 *      mounts clean, with no uncaught errors and no "Maximum update depth";
 *   4. a second note can be created once the list is non-empty.
 *
 * Editing requires the editor to be editable — tablet (≥768px) and up.
 */

import { expect, test } from '@playwright/test';
import { seedUserWithProfile, signIn } from '../fixtures/auth';
import { editorLocator, seedNote } from './helpers';

test.describe('editor regressions', () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) < 768, 'editor requires tablet or wider');

  test('slash menu applies a heading and keeps focus in the document', async ({ page, context }) => {
    const user = await seedUserWithProfile('reg-h1');
    const note = await seedNote(user.id, 'Regression H1');
    await signIn(context, user);

    await page.goto(`/app/notes/${note.id}`);
    await editorLocator(page).click();
    // The title h1 is auto-inserted as the first block (Notion-style).
    // Navigate to the empty body paragraph below it.
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100); // let the new paragraph settle
    await page.keyboard.type('/');
    await expect(page.getByRole('listbox')).toBeVisible();

    // Select Heading 1 directly from the menu.
    await page.getByRole('option', { name: 'Heading 1' }).click();
    await expect(page.getByRole('listbox')).toBeHidden();

    // Focus returned to the editor — the next keystrokes land in the doc.
    await expect(editorLocator(page)).toBeFocused();
    await page.keyboard.type('Lecture one');
    await expect(editorLocator(page).locator('h1').filter({ hasText: 'Lecture one' })).toBeVisible();

    await note.cleanup();
    await user.cleanup();
  });

  test('slash menu applies a bullet list', async ({ page, context }) => {
    const user = await seedUserWithProfile('reg-ul');
    const note = await seedNote(user.id, 'Regression UL');
    await signIn(context, user);

    await page.goto(`/app/notes/${note.id}`);
    await editorLocator(page).click();
    // Navigate to the empty body paragraph below the auto-inserted title h1.
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await page.keyboard.type('/');
    await expect(page.getByRole('listbox')).toBeVisible();

    await page.keyboard.type('bul'); // filters to Bullet list only
    await page.keyboard.press('Enter');
    await expect(editorLocator(page).locator('ul')).toHaveCount(1);

    await page.keyboard.type('first item');
    await expect(editorLocator(page).locator('ul li').filter({ hasText: 'first item' })).toBeVisible();

    await note.cleanup();
    await user.cleanup();
  });

  test('slash menu inserts a display equation', async ({ page, context }) => {
    const user = await seedUserWithProfile('reg-eq');
    const note = await seedNote(user.id, 'Regression Equation');
    await signIn(context, user);

    await page.goto(`/app/notes/${note.id}`);
    await editorLocator(page).click();
    // Navigate to the empty body paragraph below the auto-inserted title h1.
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await page.keyboard.type('/');
    await expect(page.getByRole('listbox')).toBeVisible();
    await page.waitForTimeout(100); // let the listbox stabilize

    await page.keyboard.type('block eq'); // filters to Block equation
    await page.keyboard.press('Enter');
    await expect(page.getByRole('listbox')).toBeHidden();

    // Equation hands focus to the MathInput dialog (display mode).
    await page.getByRole('dialog').locator('input').waitFor();
    await expect(page.getByRole('dialog').locator('input')).toBeFocused();
    await page.getByRole('dialog').locator('input').fill('E=mc^2');
    await page.keyboard.press('Enter');
    // The blockMath nodeview uses .katex (not .katex-display) — match the
    // existing editor-display-math test which asserts either class.
    await expect(editorLocator(page).locator('.katex-display, .katex')).toBeVisible();

    await note.cleanup();
    await user.cleanup();
  });

  test('editor mounts without the shortcut render loop', async ({ page, context }) => {
    const pageErrors: string[] = [];
    const consoleErrors: string[] = [];
    page.on('pageerror', (e) => pageErrors.push(String(e)));
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    const user = await seedUserWithProfile('reg-loop');
    const note = await seedNote(user.id, 'Regression Loop');
    await signIn(context, user);

    await page.goto(`/app/notes/${note.id}`);
    await editorLocator(page).waitFor({ state: 'visible' });
    // Leave the effects a few cycles to misbehave if the loop is back.
    await page.waitForTimeout(500);

    expect(pageErrors).toEqual([]);
    expect(consoleErrors.filter((e) => e.includes('Maximum update depth'))).toEqual([]);

    await note.cleanup();
    await user.cleanup();
  });

  test('a second note can be created once the list is non-empty', async ({ page, context }) => {
    const user = await seedUserWithProfile('reg-multi');
    await signIn(context, user);

    // Need a course first (phase-03c: notes created inside a course)
    await page.goto('/app/courses/new');
    await expect(page.getByRole('button', { name: 'Create course' })).toBeVisible();
    await page.getByRole('button', { name: 'Create course' }).click();
    await page.waitForURL(/\/app\/courses\/[0-9a-f]{8}-/);
    const courseId = page.url().split('/').pop();

    await page.goto(`/app/courses/${courseId}`);
    // Header button (first of two "New note" on the page — the other is in empty state)
    await expect(page.getByRole('button', { name: 'New note' }).first()).toBeVisible();
    await page.getByRole('button', { name: 'New note' }).first().click();
    await page.waitForURL(/\/app\/notes\/[0-9a-f]{8}-/);
    const firstId = page.url().split('/').pop();

    // The header keeps the button reachable once the list is non-empty.
    await page.goto(`/app/courses/${courseId}`);
    await expect(page.getByRole('button', { name: 'New note' }).first()).toBeVisible();
    await page.getByRole('button', { name: 'New note' }).first().click();
    await page.waitForURL(/\/app\/notes\/[0-9a-f]{8}-/);
    const secondId = page.url().split('/').pop();
    expect(secondId).not.toBe(firstId);

    await page.goto(`/app/courses/${courseId}`);
    await expect(page.locator('a[href^="/app/notes/"]')).toHaveCount(2);

    await user.cleanup();
  });
});
