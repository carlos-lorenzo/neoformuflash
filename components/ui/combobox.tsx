'use client';

/*
 * Client: a text input with an asynchronous suggestion list.
 *
 * Free text is ALWAYS the value. The list is a convenience, never a gate —
 * this component exists because the closed <Select> of 27 universities was the
 * thing blocking signup for everyone outside that list, and a combobox that
 * secretly still requires a match would reintroduce the same bug wearing a
 * different control.
 *
 * Not Radix: @radix-ui ships no combobox and adding a popover dependency for
 * one field is not worth it. The keyboard model (↓/↑ to move, Enter to accept,
 * Esc to dismiss, roving aria-activedescendant) follows components/editor/
 * slash-menu.tsx, including its focus discipline — see the blur handling below.
 */

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { cn } from '@/lib/cn';

export type ComboboxOption = { id: string; name: string };

export type ComboboxProps = {
  /** The current free-text value. */
  value: string;
  onValueChange: (next: string) => void;
  /**
   * Fetches suggestions for a query. Already debounced by this component.
   * Must resolve to [] rather than throwing — a failed lookup degrades to
   * "no suggestions", it never blocks the field.
   */
  onSearch: (query: string) => Promise<ComboboxOption[]>;
  /** Translated label. Required — an input without a label fails axe. */
  label: string;
  placeholder?: string;
  /** Translated helper text, shown when there is no error. */
  hint?: string;
  /** Translated error text. */
  error?: string;
  /** Translated empty-result text. */
  noResultsLabel: string;
  name?: string;
  maxLength?: number;
  autoComplete?: string;
};

/** Long enough that a fast typist does not fire a request per keystroke. */
const DEBOUNCE_MS = 200;

export function Combobox({
  value,
  onValueChange,
  onSearch,
  label,
  placeholder,
  hint,
  error,
  noResultsLabel,
  name,
  maxLength,
  autoComplete = 'off',
}: ComboboxProps) {
  const inputId = useId();
  const listId = `${inputId}-list`;
  const messageId = `${inputId}-message`;

  const [options, setOptions] = useState<ComboboxOption[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [searched, setSearched] = useState(false);

  const rootRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /*
   * Guards against an out-of-order response overwriting a newer one: the user
   * types "u" then "upv", and the slower "u" request resolves last. Comparing
   * a monotonic id is cheaper and more reliable than AbortController here.
   */
  const requestIdRef = useRef(0);
  const hasMessage = Boolean(error ?? hint);

  const runSearch = useCallback(
    (query: string) => {
      const id = ++requestIdRef.current;
      if (query.trim() === '') {
        setOptions([]);
        setSearched(false);
        return;
      }
      void onSearch(query).then((next) => {
        if (id !== requestIdRef.current) return;
        setOptions(next);
        setSearched(true);
        setActiveIndex(-1);
      });
    },
    [onSearch]
  );

  const handleChange = (next: string) => {
    onValueChange(next);
    setOpen(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => runSearch(next), DEBOUNCE_MS);
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      // Any in-flight response that lands after unmount is discarded.
      requestIdRef.current += 1;
    };
  }, []);

  const choose = (option: ComboboxOption) => {
    onValueChange(option.name);
    setOpen(false);
    setActiveIndex(-1);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      if (!open) return;
      // Dismiss the list only. Clearing the field on Escape would discard
      // typing the user never asked to discard.
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      setActiveIndex(-1);
      return;
    }

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (options.length === 0) return;
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) => {
        const delta = event.key === 'ArrowDown' ? 1 : -1;
        const next = current + delta;
        if (next < 0) return options.length - 1;
        if (next >= options.length) return 0;
        return next;
      });
      return;
    }

    if (event.key === 'Enter') {
      // Only intercept Enter when a suggestion is actually highlighted.
      // Otherwise Enter must submit the form, as it would in any text input.
      const option = activeIndex >= 0 ? options[activeIndex] : undefined;
      if (!open || !option) return;
      event.preventDefault();
      choose(option);
    }
  };

  /*
   * Close on focus leaving the whole control, not on input blur: blurring to
   * click a suggestion would otherwise unmount the list before the click
   * lands. relatedTarget tells us where focus actually went.
   */
  const handleBlur = (event: React.FocusEvent<HTMLDivElement>) => {
    if (event.relatedTarget && rootRef.current?.contains(event.relatedTarget)) return;
    setOpen(false);
    setActiveIndex(-1);
  };

  const showList = open && (options.length > 0 || searched);
  const activeId = activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined;

  return (
    <div className="flex flex-col gap-1" ref={rootRef} onBlur={handleBlur}>
      <label htmlFor={inputId} className="text-ui-sm font-medium text-secondary">
        {label}
      </label>

      <div className="relative">
        <input
          id={inputId}
          name={name}
          type="text"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={activeId}
          aria-invalid={error ? true : undefined}
          aria-describedby={hasMessage ? messageId : undefined}
          autoComplete={autoComplete}
          maxLength={maxLength}
          placeholder={placeholder}
          value={value}
          onChange={(event) => handleChange(event.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (options.length > 0) setOpen(true);
          }}
          className={cn(
            'duration-instant h-11 w-full rounded-sm border bg-inset px-3 text-ui-base text-primary transition-colors ease-out',
            'placeholder:text-tertiary',
            error ? 'border-danger' : 'border-subtle hover:border-strong'
          )}
        />

        {showList ? (
          <ul
            id={listId}
            role="listbox"
            aria-label={label}
            // 300px matches the slash menu's list, the other filtered
            // keyboard-navigated list in this app, and is on the 4px grid.
            style={{ maxHeight: 300 }}
            className="shadow-overlay absolute inset-x-0 top-full z-50 mt-1 overflow-y-auto rounded-md border border-subtle bg-overlay py-1"
          >
            {options.length === 0 ? (
              <li className="px-3 py-2 text-ui-sm text-tertiary">{noResultsLabel}</li>
            ) : (
              options.map((option, index) => (
                <li
                  key={option.id}
                  id={`${listId}-${index}`}
                  role="option"
                  aria-selected={index === activeIndex}
                  // Mouse down rather than click: click fires after blur, and
                  // by then the list is gone.
                  onMouseDown={(event) => {
                    event.preventDefault();
                    choose(option);
                  }}
                  onMouseEnter={() => setActiveIndex(index)}
                  className={cn(
                    'duration-instant cursor-pointer px-3 py-2 text-ui-sm transition-colors ease-out',
                    index === activeIndex ? 'bg-subtle text-primary' : 'text-secondary'
                  )}
                >
                  {option.name}
                </li>
              ))
            )}
          </ul>
        ) : null}
      </div>

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
}
