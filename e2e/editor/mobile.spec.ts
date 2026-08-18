/*
 * AC10: at 390px the editor is read-only with a clear message
 * (design-system §6: "Editor shows 'open on a larger screen'").
 */

import { expect, test } from '@playwright/test';
import { seedUserWithProfile, signIn } from '../fixtures/auth';
import { seedNote } from './helpers';

test.describe('editor-mobile', () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) !== 390, 'mobile width only');

  test('editor-mobile-readonly', async ({ page, context }) => {
    const user = await seedUserWithProfile('mobile');
    const note = await seedNote(user.id, 'Mobile');
    await signIn(context, user);

    await page.goto(`/app/notes/${note.id}`);

    // The clear read-only message is shown.
    await expect(page.getByText('Read-only')).toBeVisible();

    // The note title is shown (Notion-style first block)
    await expect(page.getByRole('heading', { name: 'Mobile' })).toBeVisible();

    // The read-only NoteDocView surface is present instead of the editor
    await expect(page.locator('.note-doc-view')).toHaveCount(1);

    // The editor is not mounted on mobile
    const editor = page.locator('.tiptap, .ProseMirror');
    await expect(editor).toHaveCount(0);

    await note.cleanup();
    await user.cleanup();
  });
});
