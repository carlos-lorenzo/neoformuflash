/*
 * Phase-02 editor acceptance flows, per specs/phase-02-editor.md:
 *   1. editor-markdown-shortcuts   (AC1)
 *   2. editor-slash-menu           (AC2)
 *   3. editor-inline-math          (AC3)
 *   4. editor-display-math         (AC4)
 *   5. editor-invalid-latex        (AC5)
 *   6. editor-autosave-and-reload  (AC6/AC7)
 *   7. editor-undo-math-boundary   (spec: "write the test first")
 *
 * Editing requires the editor to be editable — tablet (≥768px) and up.
 */

import { expect, test } from '@playwright/test';
import { seedUserWithProfile, signIn } from '../fixtures/auth';
import { editorLocator, seedNote, waitForSaveStatus } from './helpers';

test.describe('editor', () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) < 768, 'editor requires tablet or wider');

  test('editor-markdown-shortcuts', async ({ page, context }) => {
    const user = await seedUserWithProfile('markdown');
    const note = await seedNote(user.id, 'Markdown');
    await signIn(context, user);

    await page.goto(`/app/notes/${note.id}`);
    const editor = editorLocator(page);
    await editor.click();

    // # → heading 1
    await page.keyboard.type('# Title');
    await page.keyboard.press('Enter');
    await expect(page.locator('h1').filter({ hasText: 'Title' })).toBeVisible();

    // - → bullet list. Enter again on the empty item exits the list so the
    // next input rule can fire (otherwise `1. ` nests inside the bullet list).
    await page.keyboard.type('- one');
    await page.keyboard.press('Enter');
    await expect(page.locator('ul li').filter({ hasText: 'one' })).toBeVisible();
    await page.keyboard.press('Enter');

    // 1. → ordered list
    await page.keyboard.type('1. first');
    await page.keyboard.press('Enter');
    await expect(page.locator('ol li').filter({ hasText: 'first' })).toBeVisible();
    await page.keyboard.press('Enter');

    // > → blockquote
    await page.keyboard.type('> quote');
    await page.keyboard.press('Enter');
    await expect(page.locator('blockquote').filter({ hasText: 'quote' })).toBeVisible();
    await page.keyboard.press('Enter');

    // ``` → code block
    await page.keyboard.type('``` code();');
    await expect(page.locator('pre code')).toBeVisible();

    await note.cleanup();
    await user.cleanup();
  });

  test('editor-slash-menu', async ({ page, context }) => {
    const user = await seedUserWithProfile('slash');
    const note = await seedNote(user.id, 'Slash');
    await signIn(context, user);

    await page.goto(`/app/notes/${note.id}`);
    await editorLocator(page).click();

    // `/` at the start of an empty block opens the menu (AC2).
    await page.keyboard.type('/');
    await expect(page.getByRole('listbox')).toBeVisible();

    // Arrow down + Enter selects the first item (Paragraph is index 0,
    // Heading 1 index 1 — arrow once then Enter).
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('listbox')).toBeHidden();

    await note.cleanup();
    await user.cleanup();
  });

  test('editor-slash-menu-escape-leaves-slash', async ({ page, context }) => {
    const user = await seedUserWithProfile('slash-esc');
    const note = await seedNote(user.id, 'Slash Esc');
    await signIn(context, user);

    await page.goto(`/app/notes/${note.id}`);
    await editorLocator(page).click();

    await page.keyboard.type('/');
    await expect(page.getByRole('listbox')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('listbox')).toBeHidden();

    // The `/` stays as literal text.
    await expect(editorLocator(page).locator('text="/"')).toBeVisible();

    await note.cleanup();
    await user.cleanup();
  });

  test('editor-inline-math', async ({ page, context }) => {
    const user = await seedUserWithProfile('math');
    const note = await seedNote(user.id, 'Inline Math');
    await signIn(context, user);

    await page.goto(`/app/notes/${note.id}`);
    await editorLocator(page).click();

    // `$` arms the pending flag; the next printable char seeds the input.
    await page.keyboard.type('$');
    await page.keyboard.type('\\');
    // Wait for the MathInput input to have focus before typing the body — fast
    // keystrokes otherwise land in the editor instead of the dialog.
    await expect(page.getByRole('dialog').locator('input')).toBeFocused();
    await page.keyboard.type('alpha');
    // Live KaTeX preview renders as the student types (AC3).
    await expect(page.locator('.katex')).toBeVisible();
    await page.keyboard.press('Enter');

    // The math node commits into the document.
    await expect(editorLocator(page).locator('.katex')).toBeVisible();

    await note.cleanup();
    await user.cleanup();
  });

  test('editor-display-math', async ({ page, context }) => {
    const user = await seedUserWithProfile('display');
    const note = await seedNote(user.id, 'Display Math');
    await signIn(context, user);

    await page.goto(`/app/notes/${note.id}`);
    await editorLocator(page).click();

    // `$$` on an empty line opens display mode (AC4).
    await page.keyboard.type('$$');
    await expect(page.getByRole('dialog').locator('input')).toBeFocused();
    await page.keyboard.type('E=mc^2');
    await page.keyboard.press('Enter');

    await expect(editorLocator(page).locator('.katex-display, .katex')).toBeVisible();

    await note.cleanup();
    await user.cleanup();
  });

  test('editor-invalid-latex', async ({ page, context }) => {
    const user = await seedUserWithProfile('invalid');
    const note = await seedNote(user.id, 'Invalid LaTeX');
    await signIn(context, user);

    await page.goto(`/app/notes/${note.id}`);
    await editorLocator(page).click();

    // Invalid LaTeX shows the error and never commits (AC5).
    await page.keyboard.type('$');
    await page.keyboard.type('\\');
    await expect(page.getByRole('dialog').locator('input')).toBeFocused();
    await page.keyboard.type('notaCommand{');
    await expect(page.getByText("This formula can't be previewed")).toBeVisible();
    // The surrounding paragraph is untouched and still editable.
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toBeHidden();
    // Focus returns to the editor before the next keystroke.
    await expect(editorLocator(page)).toBeFocused();
    await page.keyboard.type('still types');
    await expect(editorLocator(page).locator('text=still types')).toBeVisible();

    await note.cleanup();
    await user.cleanup();
  });

  test('editor-autosave-and-reload', async ({ page, context }) => {
    const user = await seedUserWithProfile('autosave');
    const note = await seedNote(user.id, 'Autosave');
    await signIn(context, user);

    await page.goto(`/app/notes/${note.id}`);
    await editorLocator(page).click();

    await page.keyboard.type('Persisted across reload ');
    // AC7: math nodes survive a reload too.
    await page.keyboard.type('$');
    await page.keyboard.type('\\');
    await expect(page.getByRole('dialog').locator('input')).toBeFocused();
    await page.keyboard.type('sqrt{2}');
    await page.keyboard.press('Enter');

    // idle → saving → saved (AC6).
    await waitForSaveStatus(page, 'Saved');
    // Give the autosave round-trip time to land server-side before reloading.
    await page.waitForTimeout(500);

    await page.reload();
    await expect(editorLocator(page).locator('text=Persisted across reload')).toBeVisible();
    await expect(editorLocator(page).locator('.katex')).toBeVisible();

    await note.cleanup();
    await user.cleanup();
  });

  test('editor-undo-math-boundary', async ({ page, context }) => {
    const user = await seedUserWithProfile('undo');
    const note = await seedNote(user.id, 'Undo Math');
    await signIn(context, user);

    await page.goto(`/app/notes/${note.id}`);
    await editorLocator(page).click();

    await page.keyboard.type('before ');
    await page.keyboard.type('$');
    await page.keyboard.type('x+1');
    await page.keyboard.press('Enter');
    await expect(editorLocator(page).locator('.katex')).toBeVisible();

    // Undo across the math node boundary reverts the insertion.
    await page.keyboard.press('ControlOrMeta+z');
    await expect(editorLocator(page).locator('.katex')).toBeHidden();

    await note.cleanup();
    await user.cleanup();
  });

  test('editor-markdown-image-shortcut', async ({ page, context }) => {
    const user = await seedUserWithProfile('img');
    const note = await seedNote(user.id, 'Image');
    await signIn(context, user);

    await page.goto(`/app/notes/${note.id}`);
    await editorLocator(page).click();

    // `![alt](url)` on its own block converts to an embedded image.
    await page.keyboard.type('![a diagram](https://example.com/diagram.png)');
    const img = editorLocator(page).locator('img.note-image');
    await expect(img).toHaveCount(1);
    await expect(img).toHaveAttribute('src', 'https://example.com/diagram.png');
    await expect(img).toHaveAttribute('alt', 'a diagram');

    // The markdown itself is gone, not left as literal text.
    await expect(editorLocator(page).locator('text="!["')).toHaveCount(0);

    await waitForSaveStatus(page, 'Saved');
    await page.waitForTimeout(500);
    await page.reload();
    await expect(editorLocator(page).locator('img.note-image')).toHaveCount(1);

    await note.cleanup();
    await user.cleanup();
  });

  test('editor-slash-menu-inline-splits-at-caret', async ({ page, context }) => {
    const user = await seedUserWithProfile('slash-inline');
    const note = await seedNote(user.id, 'Slash Inline');
    await signIn(context, user);

    await page.goto(`/app/notes/${note.id}`);
    await editorLocator(page).click();

    // Type a sentence, park the caret mid-line after "alpha " and type `/`.
    await page.keyboard.type('alpha beta');
    // "alpha beta" → caret after the space, before "beta".
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.type('/');
    await expect(page.getByRole('listbox')).toBeVisible();

    // Pick Heading 1 — the text after the caret becomes the heading.
    await page.keyboard.type('Heading 1');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('listbox')).toBeHidden();

    await expect(editorLocator(page).locator('h1').filter({ hasText: 'beta' })).toHaveCount(1);
    await expect(editorLocator(page).locator('p').filter({ hasText: /alpha/ })).toHaveCount(1);

    await note.cleanup();
    await user.cleanup();
  });
});
