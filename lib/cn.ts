import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/*
 * tailwind-merge has to be taught our scales.
 *
 * styles/globals.css resets Tailwind's namespaces and replaces them with
 * semantic tokens, so `text-ui-base` (a size) and `text-on-accent` (a colour)
 * both look like unfamiliar `text-*` classes to the default configuration. It
 * guesses they belong to the same group and drops one.
 *
 * That is not theoretical: it silently stripped the primary button's text
 * colour, which then inherited `--text-primary` and rendered chalk-on-blue at
 * 2.15:1. The axe run caught it; nothing else would have, because the button
 * still looked deliberate.
 */

const TEXT_COLOURS = [
  'transparent',
  'current',
  'inherit',
  'base',
  'raised',
  'overlay',
  'inset',
  'primary',
  'secondary',
  'tertiary',
  'subtle',
  'strong',
  'accent',
  'accent-hover',
  'accent-quiet',
  'on-accent',
  'success',
  'warning',
  'danger',
] as const;

const FONT_SIZES = [
  'ui-xs',
  'ui-sm',
  'ui-base',
  'ui-lg',
  'ui-xl',
  'read-sm',
  'read-base',
  'read-h1',
  'read-h2',
  'read-h3',
] as const;

const twMerge = extendTailwindMerge({
  override: {
    classGroups: {
      'font-size': [{ text: [...FONT_SIZES] }],
      'text-color': [{ text: [...TEXT_COLOURS] }],
    },
  },
});

/** Merge Tailwind classes so a caller's override wins over a component default. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
