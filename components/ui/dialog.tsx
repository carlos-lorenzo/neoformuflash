'use client';

// Client: Radix manages the focus trap, scroll lock and dismissal.

import * as RadixDialog from '@radix-ui/react-dialog';
import { cn } from '@/lib/cn';

type DialogSize = 'auth' | 'md' | 'lg' | 'xl';

export type DialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Translated. Required — a dialog without an accessible name fails axe. */
  title: string;
  /** Translated. Optional supporting line under the title. */
  description?: string;
  /** Translated accessible name for the close control. */
  closeLabel: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** Dialog width preset. Default: 'auth' (400px). */
  size?: DialogSize;
};

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  closeLabel,
  children,
  footer,
  size = 'auth',
}: DialogProps) {
  const sizeClass = {
    auth: 'max-w-auth',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
  }[size];

  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        {/*
         * Opacity and transform only (§5). The overlay fades, the panel scales
         * a fraction — neither animates a layout property, and both collapse to
         * 1ms under prefers-reduced-motion.
         */}
        <RadixDialog.Overlay className="animate-overlay fixed inset-0 z-50 bg-base/80" />

        <RadixDialog.Content
          className={cn(
            'animate-dialog fixed top-1/2 left-1/2 z-50 w-full -translate-x-1/2 -translate-y-1/2',
            sizeClass,
            'rounded-lg border border-subtle bg-overlay p-6 shadow-dialog'
          )}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col gap-1">
              <RadixDialog.Title className="text-ui-lg font-semibold text-primary">
                {title}
              </RadixDialog.Title>
              {description ? (
                <RadixDialog.Description className="text-ui-sm text-secondary">
                  {description}
                </RadixDialog.Description>
              ) : null}
            </div>

            <RadixDialog.Close
              aria-label={closeLabel}
              // size-11 (44px), not size-8: AC 6 requires every target at 390px
              // to be at least 44px, and this close button sits inside the
              // settings dialog, which is part of the shell at that width. The
              // negative margins keep the icon optically where size-8 put it.
              className="duration-instant -mt-3 -mr-3 flex size-11 shrink-0 items-center justify-center rounded-sm text-tertiary transition-colors ease-out hover:bg-raised hover:text-primary"
            >
              <CloseIcon />
            </RadixDialog.Close>
          </div>

          <div className="mt-4">{children}</div>

          {footer ? <div className="mt-6 flex justify-end gap-2">{footer}</div> : null}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

function CloseIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className="size-4 icon-inline"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" />
    </svg>
  );
}
