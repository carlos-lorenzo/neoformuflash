/*
 * AC10: at 390px the editor is read-only with a clear message
 * (design-system §6: "Editor shows 'open on a larger screen'").
 */

import { expect, test } from '@playwright/test';
import { seedUserWithProfile, signIn } from '../fixtures/auth';
import { editorLocator, seedNote } from './helpers';

test.describe('editor-mobile', () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) !== 390, 'mobile width only');

  test('editor-mobile-readonly', async ({ page, context }) => {
    const user = await seedUserWithProfile('mobile');
    const note = await seedNote(user.id, 'Mobile');
    await signIn(context, user);

    await page.goto(`/app/notes/${note.id}`);

    // The clear read-only message is shown.
    await expect(page.getByText('Open on a larger screen to edit')).toBeVisible();

    // The editing surface is not editable.
    const editable = await editorLocator(page).getAttribute('contenteditable');
    expect(editable).not.toBe('true');

    await note.cleanup();
    await user.cleanup();
  });
});
