'use client';

/*
 * One field of one card, swapping between a cheap static render and a real
 * Tiptap editor.
 *
 * Promotion is driven by the parent (which owns "which row is live"), not by
 * this component, because the parent has to keep BOTH the leaving row and the
 * arriving row mounted for one commit while focus moves between them. Doing it
 * locally would unmount the old editor in the same commit that mounts the new
 * one, and focus would land on <body> — the slash-menu bug from
 * specs/EVOLUTION.md 2026-08-07, in a new place.
 */

import type { NoteDoc } from '@neoformuflash/contracts';
import { MathEditorField, type MathEditorFieldHandle } from '@/components/editor/math-editor-field';
import { CardFieldStatic } from './card-field-static';

export function CardFieldCell({
  live,
  doc,
  label,
  placeholder,
  autoFocus,
  autoFocusPos,
  fieldRef,
  onActivate,
  onChange,
  onTabOut,
  onFocus,
  onBlur,
}: {
  live: boolean;
  doc: NoteDoc;
  label: string;
  placeholder: string;
  autoFocus: boolean;
  autoFocusPos: 'start' | 'end';
  fieldRef: React.Ref<MathEditorFieldHandle>;
  onActivate: () => void;
  onChange: (doc: NoteDoc) => void;
  onTabOut: (direction: 'forward' | 'backward') => boolean;
  onFocus: () => void;
  onBlur: () => void;
}) {
  if (!live) {
    return (
      <CardFieldStatic doc={doc} placeholder={placeholder} label={label} onActivate={onActivate} />
    );
  }

  return (
    <div className="rounded-sm border border-strong bg-inset px-3 py-2">
      <MathEditorField
        ref={fieldRef}
        content={doc}
        onChange={onChange}
        placeholder={placeholder}
        autoFocus={autoFocus}
        autoFocusPos={autoFocusPos}
        onTabOut={onTabOut}
        onFocus={onFocus}
        onBlur={onBlur}
      />
    </div>
  );
}
