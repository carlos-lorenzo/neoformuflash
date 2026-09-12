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

/**
 * Block items that, when chosen from a mid-line `/`, wrap the text *after* the
 * caret. For those the editor splits the paragraph at the caret before running
 * the action, so the trailing text becomes the new block. Equation/AI items are
 * not here — they insert at the caret or operate on a selection instead.
 */
const SPLITS_INLINE = new Set([
  'paragraph',
  'heading1',
  'heading2',
  'heading3',
  'bulletList',
  'orderedList',
  'codeBlock',
  'blockquote',
]);

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
  availableProviders?: Array<'openai' | 'anthropic' | 'google' | 'deepseek'>;
  /** Default AI provider (first available). */
  defaultProvider?: 'openai' | 'anthropic' | 'google' | 'deepseek';
  /** Opens the copilot menu for the given action. */
  onOpenCopilot?: (
    action: 'generate' | 'explain' | 'summarize' | 'rephrase' | 'continue' | 'fix_latex' | 'generate_cards',
    provider?: 'openai' | 'anthropic' | 'google' | 'deepseek'
  ) => void;
  /** True when `/` was typed mid-line: block items split the paragraph first. */
  inline?: boolean;
};

export function SlashMenu({ editor, position, onClose, onCancel, onInsertInlineEquation, onInsertBlockEquation, hasAiKey, onOpenCopilot, defaultProvider, inline = false }: SlashMenuProps) {
  const t = useTranslations('editor.blocks');
  const tp = useTranslations('editor');
  const ai = useTranslations('ai.copilot');
  const [filter, setFilter] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [showImagePrompt, setShowImagePrompt] = useState(false);
  const [imageUrl, setImageUrl] = useState('');
  const [imageError, setImageError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const urlInputRef = useRef<HTMLInputElement>(null);
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
      { id: 'image', label: t('image'), action: () => setShowImagePrompt(true), focusesOwnInput: true },
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
            { id: 'ai-generate-cards', label: ai('actions.generate_cards'), action: () => onOpenCopilot('generate_cards', defaultProvider) },
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
    if (!showImagePrompt) inputRef.current?.focus();
  }, [showImagePrompt]);

  // Focus the URL input when the image prompt opens.
  useEffect(() => {
    if (showImagePrompt) urlInputRef.current?.focus();
  }, [showImagePrompt]);

  /*
   * Insert the image from the inline URL field. Equivalent to typing
   * `![](url)` and letting the markdown input rule fire — same http(s) gate,
   * same block placement — but without making the student memorise syntax.
   */
  const commitImage = useCallback(() => {
    const src = imageUrl.trim();
    if (!/^https?:\/\//i.test(src)) {
      setImageError(tp('imageUrlInvalid'));
      return;
    }
    setImageError(null);
    editor.chain().focus().setImage({ src, alt: '' }).run();
    onClose();
    // The menu unmounts with focus inside it — return focus to the editor so
    // the student keeps typing where they left off.
    void Promise.resolve().then(() => {
      editor.chain().focus().run();
    });
  }, [editor, imageUrl, onClose, tp]);

  const backToList = useCallback(() => {
    setShowImagePrompt(false);
    setImageError(null);
  }, []);

  const handleImageKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        commitImage();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        backToList();
      }
    },
    [commitImage, backToList],
  );

  const selectItem = useCallback(
    (item: SlashMenuItem) => {
      // The image entry swaps the menu body to its inline URL field instead
      // of closing — the insert happens from commitImage on Enter.
      if (item.id === 'image') {
        setShowImagePrompt(true);
        return;
      }
      // Mid-line trigger: split the paragraph at the caret first so the chosen
      // block style wraps the text after the caret (the text before it stays in
      // its own paragraph).
      if (inline && SPLITS_INLINE.has(item.id)) {
        editor.chain().focus().splitBlock().run();
      }
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
    [editor, onClose, inline],
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
      {showImagePrompt ? (
        <div className="flex flex-col gap-2 p-3">
          <input
            ref={urlInputRef}
            type="text"
            value={imageUrl}
            onChange={(e) => {
              setImageUrl(e.target.value);
              setImageError(null);
            }}
            onKeyDown={handleImageKeyDown}
            placeholder={tp('imageUrlPlaceholder')}
            aria-label={tp('imageUrlPlaceholder')}
            className="w-full rounded-md border border-subtle bg-raised px-3 py-2 text-ui-sm text-primary outline-none placeholder:text-tertiary focus:border-strong"
          />
          {imageError && (
            <p className="text-ui-xs text-danger">{imageError}</p>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={backToList}
              className="h-11 flex-1 rounded-md border border-subtle bg-raised px-3 text-ui-sm text-secondary transition-colors hover:text-primary"
            >
              {tp('imageBack')}
            </button>
            <button
              type="button"
              onClick={commitImage}
              className="h-11 flex-1 rounded-md bg-accent px-3 text-ui-sm text-on-accent transition-colors hover:bg-accent-hover"
            >
              {tp('imageInsert')}
            </button>
          </div>
        </div>
      ) : (
      <>
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
      </>
      )}
    </div>
  );
}
