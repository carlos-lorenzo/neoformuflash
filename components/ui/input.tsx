'use client';

// Client: controlled value and blur validation are interactive concerns.

import { forwardRef, useId } from 'react';
import { cn } from '@/lib/cn';

export type InputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> & {
  /** Translated label. Required — an input without a label fails axe. */
  label: string;
  /** Translated error text. Presence switches the field into its error state. */
  error?: string;
  /** Translated helper text, shown only when there is no error. */
  hint?: string;
};

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, hint, id, className, ...props },
  ref
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const messageId = `${inputId}-message`;
  const hasMessage = Boolean(error ?? hint);

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={inputId} className="text-ui-sm font-medium text-secondary">
        {label}
      </label>

      <input
        ref={ref}
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={hasMessage ? messageId : undefined}
        className={cn(
          'duration-instant h-11 rounded-sm border bg-inset px-3 text-ui-base text-primary transition-colors ease-out',
          'placeholder:text-tertiary',
          'disabled:cursor-not-allowed disabled:opacity-50',
          error ? 'border-danger' : 'border-subtle hover:border-strong',
          className
        )}
        {...props}
      />

      {hasMessage ? (
        <p
          id={messageId}
          // Errors are announced, hints are not — a hint read aloud on every
          // keystroke is noise.
          role={error ? 'alert' : undefined}
          className={cn('text-ui-xs tracking-ui', error ? 'text-danger' : 'text-tertiary')}
        >
          {error ?? hint}
        </p>
      ) : null}
    </div>
  );
});
