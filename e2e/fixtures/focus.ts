import { expect, type Page } from '@playwright/test';

/*
 * Selector for controls that are genuinely in the tab order.
 *
 * The naive version — every a/button/input/select — demanded a focus ring from
 * things that can never receive focus: Radix renders an `aria-hidden`,
 * `tabindex="-1"` native <select> alongside its combobox for form
 * compatibility, and a disabled control is skipped by the browser entirely.
 * WCAG asks for a visible indicator on what a keyboard user can reach, so
 * failing on those was the test being wrong, not the UI.
 */
const FOCUSABLE = [
  'a[href]',
  'button',
  'input',
  'select',
  'textarea',
  '[tabindex]',
]
  .map(
    (base) =>
      `${base}:not([tabindex="-1"]):not([disabled]):not([aria-hidden="true"]):not([aria-disabled="true"])`
  )
  .join(', ');

/**
 * design-system.md §9.5: focus every interactive element and assert a visible
 * indicator on each. An outline or a ring drawn with box-shadow both count;
 * what fails is nothing at all.
 */
export async function expectVisibleFocusRings(page: Page, label: string): Promise<void> {
  const controls = page.locator(FOCUSABLE);
  const count = await controls.count();
  expect(count, `no focusable controls found on ${label}`).toBeGreaterThan(0);

  let checked = 0;

  for (let index = 0; index < count; index += 1) {
    const control = controls.nth(index);
    if (!(await control.isVisible())) continue;

    await control.focus();

    const indicator = await control.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        focused: document.activeElement === element,
        outlineWidth: Number.parseFloat(style.outlineWidth),
        outlineStyle: style.outlineStyle,
        boxShadow: style.boxShadow,
        html: element.outerHTML.slice(0, 100),
      };
    });

    // If focus did not land, the element is not keyboard-reachable and the
    // indicator requirement does not apply to it.
    if (!indicator.focused) continue;

    const visible =
      (indicator.outlineStyle !== 'none' && indicator.outlineWidth > 0) ||
      (indicator.boxShadow !== 'none' && indicator.boxShadow !== '');

    expect(visible, `no focus indicator on ${label}: ${indicator.html}`).toBe(true);
    checked += 1;
  }

  expect(checked, `no control on ${label} could actually take focus`).toBeGreaterThan(0);
}
