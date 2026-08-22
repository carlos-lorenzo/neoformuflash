'use client';

import { forwardRef, useId } from 'react';
import { cn } from '@/lib/cn';

export type TextareaProps = Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'size'> & {
  /** Translated label. Required — a textarea without a label fails axe. */
  label: string;
  /** Translated error text. Presence switches the field into its error state. */
  error?: string;
  /** Translated helper text, shown only when there is no error. */
  hint?: string;
};

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, error, hint, id, className, ...props },
  ref
) {
  const generatedId = useId();
  const textareaId = id ?? generatedId;
  const messageId = `${textareaId}-message`;
  const hasMessage = Boolean(error ?? hint);

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={textareaId} className="text-ui-sm font-medium text-secondary">
        {label}
      </label>

      <textarea
        ref={ref}
        id={textareaId}
        aria-invalid={error ? true : undefined}
        aria-describedby={hasMessage ? messageId : undefined}
        className={cn(
          'duration-instant rounded-sm border bg-inset p-3 text-ui-base text-primary transition-colors ease-out',
          'placeholder:text-tertiary',
          'disabled:cursor-not-allowed disabled:opacity-50',
          'min-h-24',
          error ? 'border-danger' : 'border-subtle hover:border-strong',
          className
        )}
        {...props}
      />

      {hasMessage ? (
        <p
          id={messageId}
          role={error ? 'alert' : undefined}
          className={cn('text-ui-xs tracking-ui', error ? 'text-danger' : 'text-tertiary')}
        >
          {error ?? hint}
        </p>
      ) : null}
    </div>
  );
});