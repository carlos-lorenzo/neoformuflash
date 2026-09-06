import { expect, test, type Page } from '@playwright/test';
import { seedUserWithProfile, signIn, type SeededUser } from '../fixtures/auth';
import { seedDeckWithCards } from '../review/helpers';

/*
 * The Quizlet-style deck editor.
 *
 * design-system.md §6 makes the editor read-only below 768px, so the grid
 * itself is only exercised at tablet and above; the mobile project asserts the
 * read-only branch instead.
 *
 * The assertions worth reading twice are the focus ones. A hand-off that
 * unmounts the leaving row in the same commit as it mounts the arriving one
 * drops focus to <body>, and the student's next keystrokes go nowhere — the
 * exact shape of the slash-menu bug in specs/EVOLUTION.md (2026-08-07), which
 * shipped because the suite only checked that the menu closed.
 */

const GRID = 'ol > li';

async function openDeck(page: Page, deckId: string) {
  await page.goto(`/app/decks/${deckId}`);
  await expect(page.locator(GRID).first()).toBeVisible();
}

/**
 * Click a field and WAIT until focus is actually inside its editor.
 *
 * Promotion mounts a real Tiptap view and autofocuses it, which is not
 * instantaneous. Pressing a key before that lands sends it to the static
 * button instead, and the test reads as a product bug when it is only a race
 * in the harness.
 */
async function focusField(page: Page, rowIndex: number, side: 'front' | 'back') {
  const name = side === 'front' ? /front/i : /back/i;
  await page.locator(GRID).nth(rowIndex).getByRole('button', { name }).click();
  await expect(page.locator('.ProseMirror')).toHaveCount(2);

  /*
   * Wait for the RIGHT field, not merely for "some editor has focus". Both
   * fields of the row mount together, so a laxer poll can pass while focus is
   * still in the front one, and a subsequent Tab then tests the wrong
   * transition.
   */
  await expect
    .poll(
      () =>
        page.evaluate((wanted) => {
          const active = document.activeElement?.closest('.ProseMirror');
          if (!active) return -1;
          const row = active.closest('li');
          if (!row) return -1;
          const editors = Array.from(row.querySelectorAll('.ProseMirror'));
          return editors.indexOf(active as Element) === (wanted === 'front' ? 0 : 1) ? 1 : 0;
        }, side),
      { timeout: 5000 }
    )
    .toBe(1);
}

/** Where focus actually is, as "tag.class" plus the row it belongs to. */
async function focusInfo(page: Page) {
  return page.evaluate(() => {
    const el = document.activeElement;
    if (!el) return { tag: 'none', row: -1 };
    const pm = el.closest('.ProseMirror');
    const li = el.closest('li');
    const rows = Array.from(document.querySelectorAll('ol > li'));
    return {
      tag: el.tagName.toLowerCase(),
      isEditor: Boolean(pm),
      row: li ? rows.indexOf(li) : -1,
    };
  });
}

test.describe('deck-multi-card-editor', () => {
  let user: SeededUser;
  let deck: Awaited<ReturnType<typeof seedDeckWithCards>>;

  test.beforeEach(async ({ context }) => {
    user = await seedUserWithProfile('deck-editor');
    await signIn(context, user);
    deck = await seedDeckWithCards(user.id, 3);
  });

  test.afterEach(async () => {
    await deck.cleanup();
    await user.cleanup();
  });

  test('renders every card on one page, with no editors mounted yet', async ({ page }, info) => {
    test.skip(info.project.name === 'mobile-390', 'editor is read-only below 768');
    await openDeck(page, deck.id);

    await expect(page.locator(GRID)).toHaveCount(3);
    // Only the active row mounts real editors; 200 cards must not mean 400.
    await expect(page.locator('.ProseMirror')).toHaveCount(0);
  });

  test('clicking a field mounts exactly two editors — that row only', async ({ page }, info) => {
    test.skip(info.project.name === 'mobile-390', 'editor is read-only below 768');
    await openDeck(page, deck.id);

    await focusField(page, 1, 'front');
    await expect(page.locator('.ProseMirror')).toHaveCount(2);
  });

  test('Tab walks front → back → next card, and never drops focus to body', async ({
    page,
  }, info) => {
    test.skip(info.project.name === 'mobile-390', 'editor is read-only below 768');
    await openDeck(page, deck.id);

    await focusField(page, 0, 'front');

    const seen: Array<{ isEditor?: boolean; row: number }> = [];
    for (let step = 0; step < 3; step += 1) {
      const info = await focusInfo(page);
      seen.push(info);
      expect(info.tag, `focus fell to <${info.tag}> at step ${step}`).not.toBe('body');
      expect(info.isEditor).toBe(true);
      await page.keyboard.press('Tab');
      await page.waitForTimeout(150);
    }

    // Started on row 0, and by the third stop we are on row 1 (front → back →
    // next card's front).
    expect(seen[0]!.row).toBe(0);
    expect(seen[1]!.row).toBe(0);
    expect(seen[2]!.row).toBe(1);

    const after = await focusInfo(page);
    expect(after.tag).not.toBe('body');
  });

  test('Tab from the last card adds a new one and focuses it', async ({ page }, info) => {
    test.skip(info.project.name === 'mobile-390', 'editor is read-only below 768');
    await openDeck(page, deck.id);

    await focusField(page, 2, 'back');

    await page.keyboard.press('Tab');
    await expect(page.locator(GRID)).toHaveCount(4);

    const focus = await focusInfo(page);
    expect(focus.isEditor).toBe(true);
    expect(focus.row).toBe(3);

    // Typing into the appended row persists it.
    await page.keyboard.type('Brand new front');
    await page.keyboard.press('Tab');
    await page.keyboard.type('Brand new back');

    await expect(page.getByText('Saved').first()).toBeVisible({ timeout: 10_000 });

    await page.reload();
    await expect(page.locator(GRID)).toHaveCount(4);
    await expect(page.getByText('Brand new front')).toBeVisible();
  });

  test('an appended card left blank is never created', async ({ page }, info) => {
    test.skip(info.project.name === 'mobile-390', 'editor is read-only below 768');
    await openDeck(page, deck.id);

    await focusField(page, 2, 'back');
    await page.keyboard.press('Tab');
    await expect(page.locator(GRID)).toHaveCount(4);

    // Walk away without typing anything.
    await page.keyboard.press('Escape');
    await page.waitForTimeout(1200);
    await page.reload();

    await expect(page.locator(GRID)).toHaveCount(3);
  });

  test('edits autosave and survive a reload', async ({ page }, info) => {
    test.skip(info.project.name === 'mobile-390', 'editor is read-only below 768');
    await openDeck(page, deck.id);

    await focusField(page, 0, 'front');
    await page.keyboard.press('End');
    await page.keyboard.type(' EDITED');

    await expect(page.getByText('Saved').first()).toBeVisible({ timeout: 10_000 });
    await page.reload();
    await expect(page.getByText(/Front of card 1 EDITED/)).toBeVisible();
  });

  test('⌘M opens the equation panel over the BACK field when back has focus', async ({
    page,
  }, info) => {
    test.skip(info.project.name === 'mobile-390', 'editor is read-only below 768');
    /*
     * The pair-mode regression, in a browser. The dispatcher fires only the
     * last-registered match for a key, so if rows registered ⌘M themselves the
     * binding would act on the wrong field — or on no field at all.
     */
    await openDeck(page, deck.id);
    await focusField(page, 0, 'back');

    await page.keyboard.press('ControlOrMeta+m');
    // MathInput is a role="dialog" portalled to document.body.
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5000 });
  });

  test('deletes a card', async ({ page }, info) => {
    test.skip(info.project.name === 'mobile-390', 'editor is read-only below 768');
    await openDeck(page, deck.id);

    await page.locator(GRID).first().getByRole('button', { name: 'Delete card 1' }).click();
    // The confirm dialog's own button carries decks.cardList.delete.
    await page.getByRole('dialog').getByRole('button', { name: 'Delete card' }).click();

    await expect(page.locator(GRID)).toHaveCount(2);
    await page.reload();
    await expect(page.locator(GRID)).toHaveCount(2);
  });

  test('is read-only below 768px', async ({ page }, info) => {
    test.skip(info.project.name !== 'mobile-390', 'mobile-only assertion');
    await page.goto(`/app/decks/${deck.id}`);

    await expect(page.locator('.ProseMirror')).toHaveCount(0);
    await expect(page.getByText(/read-only/i)).toBeVisible();
  });
});
