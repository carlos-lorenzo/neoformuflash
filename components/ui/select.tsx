'use client';

// Client: Radix manages open state, focus and typeahead.

import * as RadixSelect from '@radix-ui/react-select';
import { useId } from 'react';
import { cn } from '@/lib/cn';

/*
 * Radix rather than a hand-rolled listbox. Focus trapping, typeahead, and
 * correct aria wiring are a week to build and a recurring source of axe
 * findings; the institution list at signup is ~54 items and needs all three.
 */

export type SelectOption = { value: string; label: string };

export type SelectProps = {
  label: string;
  /** Translated placeholder shown when nothing is chosen. */
  placeholder: string;
  options: SelectOption[];
  value?: string;
  onValueChange?: (value: string) => void;
  /** Translated text shown when `options` is empty. */
  emptyLabel: string;
  error?: string;
  disabled?: boolean;
  name?: string;
};

export function Select({
  label,
  placeholder,
  options,
  value,
  onValueChange,
  emptyLabel,
  error,
  disabled,
  name,
}: SelectProps) {
  const id = useId();
  const messageId = `${id}-message`;
  const isEmpty = options.length === 0;

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-ui-sm font-medium text-secondary">
        {label}
      </label>

      <RadixSelect.Root
        value={value}
        onValueChange={onValueChange}
        disabled={disabled || isEmpty}
        name={name}
      >
        <RadixSelect.Trigger
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? messageId : undefined}
          className={cn(
            'duration-instant flex h-11 items-center justify-between gap-2 rounded-sm border bg-inset px-3 transition-colors ease-out',
            'text-ui-base text-primary data-[placeholder]:text-tertiary',
            'disabled:cursor-not-allowed disabled:opacity-50',
            error ? 'border-danger' : 'border-subtle hover:border-strong'
          )}
        >
          <RadixSelect.Value placeholder={isEmpty ? emptyLabel : placeholder} />
          <RadixSelect.Icon className="text-tertiary">
            <ChevronIcon />
          </RadixSelect.Icon>
        </RadixSelect.Trigger>

        <RadixSelect.Portal>
          <RadixSelect.Content
            position="popper"
            sideOffset={4}
            className={cn(
              // Overlays are the only surfaces that cast a shadow (§4).
              'z-50 min-w-(--radix-select-trigger-width) overflow-hidden rounded-md border border-subtle bg-overlay shadow-overlay',
              // Capped to the space Radix measured, not to a magic number the
              // design system does not define. On a 390px screen the 54-item
              // institution list then fits the viewport instead of a guess.
              'max-h-(--radix-select-content-available-height)'
            )}
          >
            <RadixSelect.ScrollUpButton className="flex h-6 items-center justify-center text-tertiary">
              <ChevronIcon className="rotate-180" />
            </RadixSelect.ScrollUpButton>

            <RadixSelect.Viewport className="p-1">
              {options.map((option) => (
                <RadixSelect.Item
                  key={option.value}
                  value={option.value}
                  className={cn(
                    'duration-instant flex h-8 cursor-pointer items-center rounded-sm px-2 text-ui-sm text-primary transition-colors ease-out outline-none',
                    'data-highlighted:bg-accent-quiet',
                    'data-[state=checked]:font-medium'
                  )}
                >
                  <RadixSelect.ItemText>{option.label}</RadixSelect.ItemText>
                </RadixSelect.Item>
              ))}
            </RadixSelect.Viewport>

            <RadixSelect.ScrollDownButton className="flex h-6 items-center justify-center text-tertiary">
              <ChevronIcon />
            </RadixSelect.ScrollDownButton>
          </RadixSelect.Content>
        </RadixSelect.Portal>
      </RadixSelect.Root>

      {error ? (
        <p id={messageId} role="alert" className="text-ui-xs tracking-ui text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className={cn('size-4 icon-inline', className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <path d="M4 6l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
