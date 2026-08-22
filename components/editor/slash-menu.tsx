// Client: floating menu that appears when / is typed at the start of an empty
// block. Arrow keys navigate; Enter inserts the selected block type; Esc closes
// and leaves the / as literal text. Rows follow refs/03-editor/NOTES.md:
//   - anchored to cursor coordinates, not screen centre
//   - max-height 300px with internal scroll (300 is on the 4px grid)
//   - row density ~32px, icon container ~24px, Kbd hint flush-right

'use client';

import { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import type { Editor } from '@tiptap/core';
import { cn } from '@/lib/cn';

type SlashMenuItem = {
  id: string;
  label: string;
  action: () => void;
  focusesOwnInput?: boolean;
};

type SlashMenuProps = {
  editor: Editor;
  position: { top: number; left: number };
  /** Called after an item is selected. */
  onClose: () => void;
  /** Called on Escape — the `/` stays as literal text (AC2). */
  onCancel: () => void;
  /** Opens the inline-equation MathInput — the slash alternative to `$`. */
  onInsertInlineEquation: () => void;
  /** Opens the block-equation MathInput — the slash alternative to `$$`. */
  onInsertBlockEquation: () => void;
  /** Whether user has any AI key configured (controls AI item visibility). */
  hasAiKey: boolean;
  /** Available AI providers (for default selection in copilot). */
  availableProviders?: Array<'openai' | 'anthropic' | 'google'>;
  /** Default AI provider (first available). */
  defaultProvider?: 'openai' | 'anthropic' | 'google';
  /** Opens the copilot menu for the given action. */
  onOpenCopilot?: (
    action: 'generate' | 'explain' | 'summarize' | 'rephrase' | 'continue' | 'fix_latex',
    provider?: 'openai' | 'anthropic' | 'google'
  ) => void;
};

export function SlashMenu({ editor, position, onClose, onCancel, onInsertInlineEquation, onInsertBlockEquation, hasAiKey, onOpenCopilot, defaultProvider }: SlashMenuProps) {
  const t = useTranslations('editor.blocks');
  const tp = useTranslations('editor');
  const ai = useTranslations('ai.copilot');
  const [filter, setFilter] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const items: SlashMenuItem[] = useMemo(
    () => [
      { id: 'paragraph', label: t('paragraph'), action: () => editor.chain().focus().setParagraph().run() },
      { id: 'heading1', label: t('heading1'), action: () => editor.chain().focus().toggleHeading({ level: 1 }).run() },
      { id: 'heading2', label: t('heading2'), action: () => editor.chain().focus().toggleHeading({ level: 2 }).run() },
      { id: 'heading3', label: t('heading3'), action: () => editor.chain().focus().toggleHeading({ level: 3 }).run() },
      { id: 'bulletList', label: t('bulletList'), action: () => editor.chain().focus().toggleBulletList().run() },
      { id: 'orderedList', label: t('orderedList'), action: () => editor.chain().focus().toggleOrderedList().run() },
      { id: 'codeBlock', label: t('codeBlock'), action: () => editor.chain().focus().toggleCodeBlock().run() },
      { id: 'blockquote', label: t('blockquote'), action: () => editor.chain().focus().toggleBlockquote().run() },
      { id: 'inlineEquation', label: t('inlineEquation'), action: onInsertInlineEquation, focusesOwnInput: true },
      { id: 'blockEquation', label: t('blockEquation'), action: onInsertBlockEquation, focusesOwnInput: true },
      // AI actions (only shown when user has an AI key)
      ...(hasAiKey && onOpenCopilot
        ? [
            { id: 'ai-generate', label: ai('actions.generate'), action: () => onOpenCopilot('generate', defaultProvider) },
            { id: 'ai-explain', label: ai('actions.explain'), action: () => onOpenCopilot('explain', defaultProvider) },
            { id: 'ai-summarize', label: ai('actions.summarize'), action: () => onOpenCopilot('summarize', defaultProvider) },
            { id: 'ai-rephrase', label: ai('actions.rephrase'), action: () => onOpenCopilot('rephrase', defaultProvider) },
            { id: 'ai-continue', label: ai('actions.continue'), action: () => onOpenCopilot('continue', defaultProvider) },
            { id: 'ai-fix-latex', label: ai('actions.fix_latex'), action: () => onOpenCopilot('fix_latex', defaultProvider) },
          ]
        : []),
    ],
    [editor, t, ai, onInsertInlineEquation, onInsertBlockEquation, hasAiKey, onOpenCopilot, defaultProvider],
  );

  const filtered = useMemo(() => {
    if (!filter) return items;
    const lower = filter.toLowerCase();
    return items.filter((item) => item.label.toLowerCase().includes(lower));
  }, [items, filter]);

  // Focus the filter input on mount.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const selectItem = useCallback(
    (item: SlashMenuItem) => {
      item.action();
      onClose();
      // The filter input unmounts with the menu, dropping focus to <body> and
      // swallowing the student's next keystrokes. A microtask after the commit
      // returns focus to the editor (same pattern as MathInput's cancel).
      // MathInput items focus their own input.
      if (!item.focusesOwnInput) {
        void Promise.resolve().then(() => {
          editor.chain().focus().run();
        });
      }
    },
    [editor, onClose],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (filtered[activeIndex]) selectItem(filtered[activeIndex]);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    },
    [filtered, activeIndex, selectItem, onCancel],
  );

  // Scroll the active item into view.
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const active = list.children[activeIndex] as HTMLElement | undefined;
    active?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  return (
    <div
      className="duration-fast fixed z-50 flex flex-col overflow-hidden rounded-md border border-subtle bg-overlay shadow-overlay transition-opacity ease-out"
      style={{ top: position.top, left: position.left, width: 240, maxHeight: 300 }}
      role="listbox"
      aria-label={tp('slashPlaceholder')}
    >
      <input
        ref={inputRef}
        type="text"
        value={filter}
        onChange={(e) => {
          setFilter(e.target.value);
          setActiveIndex(0);
        }}
        onKeyDown={handleKeyDown}
        placeholder={tp('slashPlaceholder')}
        className="border-b border-subtle bg-raised px-3 py-2 text-ui-sm text-primary outline-none placeholder:text-tertiary"
      />
      <div ref={listRef} className="overflow-y-auto">
        {filtered.length === 0 ? (
          <p className="px-3 py-2 text-ui-sm text-tertiary">{tp('noMatches')}</p>
        ) : (
          filtered.map((item, i) => (
            <button
              key={item.id}
              type="button"
              role="option"
              aria-selected={i === activeIndex}
              onClick={() => selectItem(item)}
              onMouseEnter={() => setActiveIndex(i)}
              className={cn(
                'flex h-8 w-full items-center px-3 text-left text-ui-sm transition-colors',
                i === activeIndex ? 'bg-inset text-primary' : 'text-secondary',
              )}
            >
              {item.label}
            </button>
          ))
        )}
      </div>
    </div>
  );
}
