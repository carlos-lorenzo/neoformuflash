/*
 * Course-first hierarchy (phase-03b H): create a course, create a deck inside
 * it from the course detail, verify the deck shows up under the course, then
 * delete the course (decision 11) and verify it is gone from the list.
 *
 * The DB-level auto-fork behaviour is covered by tests/db/course-delete.test.ts;
 * this spec proves the UI surface reaches the same actions.
 */

import { expect, test } from '@playwright/test';
import { seedUserWithProfile, signIn, type SeededUser } from '../fixtures/auth';

let user: SeededUser;

test.beforeEach(async () => {
  user = await seedUserWithProfile('course-hierarchy');
});

test.afterEach(async () => {
  await user.cleanup();
});

test('create a course, put a deck in it, then delete the course', async ({ page }) => {
  await signIn(page.context(), user);
  await page.goto('/app');

  // Empty state offers a one-click course draft.
  await expect(page.getByRole('button', { name: 'Create course' })).toBeVisible();
  await page.getByRole('button', { name: 'Create course' }).click();

  // Landed on the new course's detail page (default title "Untitled course").
  await expect(page).toHaveURL(/\/app\/courses\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('heading', { name: 'Untitled course' })).toBeVisible();

  // Rename it through the settings form. The save action returns success but
  // the heading is server-rendered and requires a re-render to update (no
  // router.refresh in the form — same pattern as the deck form).
  const nameInput = page.getByLabel('Course name');
  await nameInput.fill('Analisis II');
  const codeInput = page.getByLabel('Course code');
  await codeInput.fill('MAT-202');
  await page.getByRole('button', { name: 'Save course' }).click();
  await expect(page.getByRole('heading', { name: 'Analisis II' })).toBeVisible();
  await expect(page.getByText('MAT-202')).toBeVisible();

  // Create a deck inside the course — a draft lands on its deck page.
  await page.getByRole('button', { name: 'New deck' }).first().click();
  await expect(page).toHaveURL(/\/app\/decks\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('heading', { name: 'Untitled deck' })).toBeVisible();

  // Back on the dashboard, the deck is listed under it.
  await page.goto('/app');
  await page.getByRole('link', { name: 'Analisis II' }).click();
  await expect(page.getByRole('link', { name: 'Untitled deck' })).toBeVisible();

  // Delete the course (decision 11 — auto-forks subscribers; here just hard
  // delete since nobody else holds progress). The delete button now lives
  // inside the collapsed Settings <details>, so open it first.
  // <summary> is not a button role, use the text content
  await page.getByText('Settings').click();
  await page.getByRole('button', { name: 'Delete course' }).click();
  await page.getByRole('button', { name: 'Delete course' }).last().click();
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByRole('heading', { name: 'Analisis II' })).toHaveCount(0);
});
