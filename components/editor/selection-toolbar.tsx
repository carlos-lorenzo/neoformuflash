// Client: floating toolbar on text selection. Shows formatting + Ask AI.

'use client';

import { useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import type { Editor } from '@tiptap/core';
import { cn } from '@/lib/cn';

interface SelectionToolbarProps {
  editor: Editor;
  onAskAI: () => void;
}

export function SelectionToolbar({ editor, onAskAI }: SelectionToolbarProps) {
  const t = useTranslations('editor.selectionToolbar');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!editor) return;

    const updatePosition = () => {
      const { from, to } = editor.state.selection;
      if (from === to) return; // No selection

      const coords = editor.view.coordsAtPos(from);
      const container = containerRef.current;
      if (container) {
        container.style.top = `${coords.bottom + 8}px`;
        container.style.left = `${coords.left}px`;
      }
    };

    editor.on('selectionUpdate', updatePosition);
    return () => {
      editor.off('selectionUpdate', updatePosition);
    };
  }, [editor]);

  const { from, to } = editor?.state.selection ?? { from: 0, to: 0 };
  const hasSelection = from !== to;

  if (!hasSelection) return null;

  return (
    <div
      ref={containerRef}
      className={cn(
        'fixed z-50 flex items-center gap-1 rounded-md border border-subtle bg-overlay p-1 shadow-overlay animate-dialog',
        'pointer-events-auto'
      )}
      style={{ opacity: hasSelection ? 1 : 0, pointerEvents: hasSelection ? 'auto' : 'none' }}
      role="toolbar"
      aria-label={t('toolbarLabel')}
    >
      <button
        type="button"
        onClick={onAskAI}
        className="flex h-8 w-8 items-center justify-center rounded text-ui-sm text-secondary hover:text-primary hover:bg-raised transition-colors"
        aria-label={t('askAI')}
      >
        <SparklesIcon className="size-4" />
      </button>
    </div>
  );
}

function SparklesIcon({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </svg>
  );
}