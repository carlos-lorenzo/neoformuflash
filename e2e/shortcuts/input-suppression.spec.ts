import { expect, test } from '@playwright/test';
import { seedUserWithProfile, signIn } from '../fixtures/auth';

/*
 * Criterion 3: no bare-letter shortcut fires while focus is in an
 * input, textarea, select or contenteditable.
 *
 * This test is written BEFORE the dispatcher (TDD). It will fail until
 * the ShortcutProvider is mounted and the keydown handler suppresses
 * bare-letter bindings when focus is in an editable element.
 *
 * We inject test elements via page.evaluate because the current /app
 * screen has no text inputs — the dashboard is an empty state. The
 * dispatcher runs on the document, so a dynamically-injected element
 * exercises the same code path a real input would.
 *
 * The string "gncse" is chosen because every letter is a bound global
 * navigation key (g prefix, g+n, g+c, g+s, g+e — though g+e and g+s
 * are not registered until those routes exist, g+n and g+c are the
 * critical ones). If suppression fails, typing "gncse" into an input
 * would navigate to /notes (g then n) and the input value would be
 * incomplete.
 */

async function waitForHydration(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: /settings/i }).waitFor();
}

const TYPE_STRING = 'gncse';

for (const editable of [
  {
    name: 'input',
    setup: `
      const el = document.createElement('input');
      el.type = 'text';
      el.setAttribute('data-testid', 'suppress-test');
      document.body.appendChild(el);
    `,
    getValue: (page: import('@playwright/test').Page) =>
      page.getByTestId('suppress-test').inputValue(),
  },
  {
    name: 'textarea',
    setup: `
      const el = document.createElement('textarea');
      el.setAttribute('data-testid', 'suppress-test');
      document.body.appendChild(el);
    `,
    getValue: (page: import('@playwright/test').Page) =>
      page.getByTestId('suppress-test').inputValue(),
  },
  {
    name: 'select',
    setup: `
      const el = document.createElement('select');
      el.setAttribute('data-testid', 'suppress-test');
      const opt = document.createElement('option');
      opt.value = 'a';
      opt.textContent = 'Option A';
      el.appendChild(opt);
      document.body.appendChild(el);
    `,
    // Native selects don't accept typed characters — the browser uses
    // keystrokes to navigate options. We only verify no navigation occurs.
    getValue: null,
  },
  {
    name: 'contenteditable',
    setup: `
      const el = document.createElement('div');
      el.setAttribute('data-testid', 'suppress-test');
      el.contentEditable = 'true';
      document.body.appendChild(el);
    `,
    getValue: (page: import('@playwright/test').Page) =>
      page.getByTestId('suppress-test').textContent(),
  },
]) {
  test(`typing "${TYPE_STRING}" into a ${editable.name} does not trigger navigation`, async ({
    page,
    context,
  }) => {
    const user = await seedUserWithProfile(`suppress-${editable.name}`);
    await signIn(context, user);

    await page.goto('/app');
    await waitForHydration(page);
    const urlBefore = page.url();

    // Inject the editable element.
    await page.evaluate(editable.setup);

    const target = page.getByTestId('suppress-test');
    await target.click();

    // Type the string — each keystroke is a real keydown event.
    await page.keyboard.type(TYPE_STRING);

    // The value must be exactly what we typed — no characters swallowed,
    // no navigation triggered mid-sequence.
    // Skip value check for select (native selects don't accept typed text).
    if (editable.getValue) {
      const value = await editable.getValue(page);
      expect(value, `expected "${TYPE_STRING}" in ${editable.name}, got "${value}"`).toBe(TYPE_STRING);
    }

    // The route must not have changed — g+n (Notes) or any other
    // shortcut must not have navigated.
    expect(page.url(), 'route changed while typing into editable').toBe(urlBefore);

    await user.cleanup();
  });
}
