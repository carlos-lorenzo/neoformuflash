import { describe, expect, it } from 'vitest';
import { cn } from './cn';

/*
 * Regression tests for a bug that reached the axe run: tailwind-merge treated
 * `text-ui-base` (a size) and `text-on-accent` (a colour) as the same class
 * group and dropped the colour, so the primary button rendered chalk text on
 * an accent fill at 2.15:1.
 *
 * The failure was invisible by inspection — the button still looked
 * intentional — which is exactly why it needs a test rather than care.
 */

describe('cn', () => {
  it('keeps a font size and a text colour together', () => {
    const result = cn('text-on-accent', 'text-ui-base');
    expect(result).toContain('text-on-accent');
    expect(result).toContain('text-ui-base');
  });

  it('still lets a later size replace an earlier size', () => {
    expect(cn('text-ui-sm', 'text-ui-xl')).toBe('text-ui-xl');
  });

  it('still lets a later colour replace an earlier colour', () => {
    expect(cn('text-secondary', 'text-danger')).toBe('text-danger');
  });

  it('lets a caller override a component default', () => {
    expect(cn('bg-accent', 'bg-raised')).toBe('bg-raised');
  });

  it('merges the real primary-button class list without losing either', () => {
    const result = cn(
      'inline-flex items-center justify-center rounded-md font-medium',
      'bg-accent text-on-accent hover:bg-accent-hover',
      'h-11 px-3 text-ui-base',
      'w-full'
    );
    expect(result).toContain('text-on-accent');
    expect(result).toContain('text-ui-base');
    expect(result).toContain('bg-accent');
  });
});

/*
 * A code review asked for `bg-color` and `border-color` overrides alongside the
 * `text-*` ones above, by analogy with the bug that motivated them.
 *
 * The analogy does not hold, and these tests are the evidence. `text-*` is
 * genuinely ambiguous — `text-ui-base` is a size and `text-on-accent` is a
 * colour, and tailwind-merge cannot tell them apart. `bg-*` and `border-*` have
 * no size scale to collide with: their non-colour groups (background-size,
 * -position, -repeat; border-width, -style) are fixed keyword and number lists,
 * and no token in specs/design-system.md §1 shares a name with one. Every
 * unrecognised `bg-*`/`border-*` therefore falls through to the colour group,
 * which is the correct answer.
 *
 * Kept as regression cover for that reasoning rather than deleted: if a future
 * token is ever named `cover`, `center`, `solid` or similar, one of these fails
 * and the override becomes justified — at which point add it, with the failing
 * case named.
 */
describe('cn: bg-* and border-* need no class-group override', () => {
  it.each([
    ['bg-raised', 'bg-inset'],
    ['bg-accent', 'bg-accent-quiet'],
    ['bg-base', 'bg-overlay'],
    ['border-subtle', 'border-strong'],
  ])('lets a later colour replace an earlier one (%s → %s)', (first, second) => {
    expect(cn(first, second)).toBe(second);
  });

  it.each([
    // colour + a genuinely different property. Dropping either is the bug.
    ['bg-accent', 'bg-cover'],
    ['bg-inset', 'bg-center'],
    ['bg-raised', 'bg-no-repeat'],
    ['border-subtle', 'border-2'],
    ['border-strong', 'border-dashed'],
  ])('keeps a colour and a non-colour utility together (%s + %s)', (colour, other) => {
    const result = cn(colour, other);
    expect(result).toContain(colour);
    expect(result).toContain(other);
  });

  it('keeps a side-specific border colour alongside the all-sides one', () => {
    const result = cn('border-subtle', 'border-t-strong');
    expect(result).toContain('border-subtle');
    expect(result).toContain('border-t-strong');
  });

  it('merges the real secondary-button class list without losing anything', () => {
    const result = cn(
      'border border-subtle bg-transparent text-primary',
      'hover:border-strong hover:bg-raised',
      'h-11 px-3 text-ui-base'
    );
    expect(result).toContain('border-subtle');
    expect(result).toContain('bg-transparent');
    expect(result).toContain('hover:border-strong');
    expect(result).toContain('hover:bg-raised');
  });
});
