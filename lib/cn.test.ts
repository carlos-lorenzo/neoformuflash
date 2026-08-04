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
