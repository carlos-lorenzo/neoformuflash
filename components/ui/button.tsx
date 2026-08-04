'use client';

// Client: needs onClick handlers, and the loading state is driven by form state.

import { forwardRef } from 'react';
import { cn } from '@/lib/cn';

/*
 * §7: exactly one primary per screen region.
 *   primary     — accent fill. The single most important action here.
 *   secondary   — transparent + hairline border.
 *   ghost       — transparent, no border, for toolbar density.
 *   destructive — danger text on transparent; filled only inside a confirm dialog.
 */
type Variant = 'primary' | 'secondary' | 'ghost' | 'destructive' | 'destructiveFilled';
type Size = 'sm' | 'md';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent text-on-accent hover:bg-accent-hover',
  secondary: 'border border-subtle bg-transparent text-primary hover:border-strong hover:bg-raised',
  ghost: 'bg-transparent text-secondary hover:bg-raised hover:text-primary',
  destructive: 'bg-transparent text-danger hover:bg-raised',
  destructiveFilled: 'bg-danger text-on-accent hover:opacity-90',
};

/*
 * Height, not padding, sets the target. `h-11` is 44px — the minimum touch
 * target at 390px (AC 6). `sm` is for dense toolbar rows on pointer devices and
 * must not be used for a primary action on a phone.
 */
const SIZES: Record<Size, string> = {
  sm: 'h-8 px-2 text-ui-sm',
  md: 'h-11 px-3 text-ui-base',
};

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  /** Accessible name for the busy state. Pass a translated string. */
  loadingLabel?: string;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'secondary',
    size = 'md',
    loading = false,
    loadingLabel,
    disabled,
    className,
    children,
    type = 'button',
    ...props
  },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      // A loading button stays focusable but is not activatable: `disabled`
      // would move focus to the body mid-submit and lose the user's place.
      disabled={disabled}
      aria-disabled={disabled || loading}
      aria-busy={loading}
      data-loading={loading ? '' : undefined}
      className={cn(
        'duration-instant inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors ease-out',
        'disabled:pointer-events-none disabled:opacity-50',
        'aria-disabled:pointer-events-none aria-disabled:opacity-50',
        VARIANTS[variant],
        SIZES[size],
        className
      )}
      onClick={loading ? undefined : props.onClick}
      {...props}
    >
      {loading ? (
        <>
          <Spinner />
          <span>{loadingLabel ?? children}</span>
        </>
      ) : (
        children
      )}
    </button>
  );
});

/*
 * The one piece of ambient motion in the product, and it is permitted because
 * the user caused it by submitting. Under prefers-reduced-motion the animation
 * is neutralised in globals.css and this reads as a static ring.
 */
function Spinner() {
  return (
    <span
      aria-hidden="true"
      className="size-4 shrink-0 animate-spin rounded-full border border-current border-t-transparent"
    />
  );
}
