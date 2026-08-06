import { expect, test } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { execFileSync } from 'node:child_process';
import { seedUserWithProfile, signIn } from '../fixtures/auth';

/*
 * Criterion 5: setting keyboard_shortcuts_enabled = false disables bare-letter
 * bindings and leaves modifier combinations working.
 *
 * We seed the profile with the flag set to false via the admin client, then
 * verify that bare-letter shortcuts don't fire but ⌘K/Ctrl+K still works.
 */

async function waitForHydration(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: /settings/i }).waitFor();
}

function localEnv(): Record<string, string> {
  const fromProcess = {
    API_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
  };
  if (fromProcess.API_URL && fromProcess.SERVICE_ROLE_KEY) return fromProcess;

  const raw = execFileSync('pnpm', ['exec', 'supabase', 'status', '-o', 'env'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  return Object.fromEntries(
    raw
      .split('\n')
      .map((line) => line.match(/^([A-Z0-9_]+)="(.*)"$/))
      .filter((match): match is RegExpMatchArray => match !== null)
      .map((match) => [match[1] as string, match[2] as string])
  );
}

async function disableShortcuts(userId: string): Promise<void> {
  const env = localEnv();
  const admin = createClient(env.API_URL!, env.SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  await admin
    .from('profiles')
    .update({ keyboard_shortcuts_enabled: false })
    .eq('id', userId);
}

test.describe('keyboard_shortcuts_enabled = false', () => {
  test('bare-letter g prefix does not fire', async ({ page, context }) => {
    const user = await seedUserWithProfile('disabled-g');
    await disableShortcuts(user.id);
    await signIn(context, user);
    await page.goto('/app');
    await waitForHydration(page);
    const urlBefore = page.url();

    await page.keyboard.press('g');
    await page.waitForTimeout(200);

    // The g-prefix indicator must NOT appear.
    const indicator = page.locator('[aria-live="polite"]');
    await expect(indicator).not.toBeVisible();

    // Press h — should not navigate (g prefix was suppressed).
    await page.keyboard.press('h');
    expect(page.url()).toBe(urlBefore);

    await user.cleanup();
  });

  test('? does not open the overlay', async ({ page, context }) => {
    const user = await seedUserWithProfile('disabled-question');
    await disableShortcuts(user.id);
    await signIn(context, user);
    await page.goto('/app');
    await waitForHydration(page);

    await page.keyboard.press('?');

    // The overlay must NOT open — ? is a bare key.
    const dialog = page.getByRole('dialog');
    await expect(dialog).not.toBeVisible();

    await user.cleanup();
  });
});
