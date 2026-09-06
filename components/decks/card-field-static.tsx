'use client';

/*
 * The cheap, read-only rendering of one card field.
 *
 * A deck of 200 cards is 400 fields. Mounting a real Tiptap editor for each
 * would mean 400 ProseMirror views on one page, so only the row being edited
 * gets real editors and everything else renders this.
 *
 * The box metrics MUST match MathEditorField's exactly. Any difference shows
 * up as the row jumping when it is clicked into, which is the single most
 * likely visual defect in this feature.
 */

import { NoteDocView } from '@/components/note/note-doc-view';
import type { NoteDoc } from '@neoformuflash/contracts';

function isBlank(doc: NoteDoc): boolean {
  if (!doc?.content || doc.content.length === 0) return true;
  return doc.content.every((block) => {
    const inline = (block as { content?: unknown[] }).content;
    return !inline || inline.length === 0;
  });
}

export function CardFieldStatic({
  doc,
  placeholder,
  label,
  onActivate,
}: {
  doc: NoteDoc;
  placeholder: string;
  /** Accessible name, e.g. "Card 3 front". */
  label: string;
  onActivate: () => void;
}) {
  const blank = isBlank(doc);

  return (
    <button
      type="button"
      aria-label={label}
      onFocus={onActivate}
      onClick={onActivate}
      className="w-full cursor-text rounded-sm border border-subtle bg-inset px-3 py-2 text-left"
    >
      {blank ? (
        <span className="text-ui-base text-tertiary">{placeholder}</span>
      ) : (
        <div className="prose prose-sm max-w-none pointer-events-none">
          <NoteDocView doc={doc} />
        </div>
      )}
    </button>
  );
}
