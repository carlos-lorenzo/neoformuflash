/**
 * Read-only renderer for NoteDoc (the frozen Tiptap content union).
 *
 * This is a Client Component so it can import KaTeX CSS directly — Server
 * Components in Next.js App Router don't reliably inject CSS from layout
 * imports, which caused math to render without styles in preview/review.
 *
 * KaTeX optical calibration: `.katex { font-size: 1.03em }` is set in the
 * card/flashcard reading surface (design-system §2), not here — NoteDocView
 * renders at the reading scale and lets the parent apply the calibration.
 *
 * Touch only for new NoteDoc node types added to the contracts package.
 */

'use client';

import type { NoteDoc } from '@neoformuflash/contracts';
import { renderNoteDoc } from './note-doc-render';

// Ensure KaTeX styles are loaded wherever NoteDocView renders
import 'katex/dist/katex.min.css';

export function NoteDocView({ doc }: { doc: NoteDoc }) {
  return renderNoteDoc(doc);
}