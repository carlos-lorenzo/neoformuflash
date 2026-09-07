/**
 * Compact single-line preview of a NoteDoc for list surfaces (deck detail card list).
 * Renders inline content of the first paragraph/heading block with KaTeX math.
 * For non-text blocks (code, list, display math), falls back to extractText.
 */

'use client';

import type { NoteDoc } from '@neoformuflash/contracts';
import type {
  BlockNode,
  InlineNode,
  TextMarks,
} from '@neoformuflash/contracts';
import katex from 'katex';
import '@/components/editor/katex-client';

/* ------------------------------------------------------------------ */
/*  KaTeX options                                                      */
/* ------------------------------------------------------------------ */

const KATEX_OPTIONS = {
  throwOnError: false,
  trust: false,
  strict: false,
} as const;

/* ------------------------------------------------------------------ */
/*  Inline rendering (client-safe, mirrors note-doc-render)           */
/* ------------------------------------------------------------------ */

function renderTextMarks(text: string, marks?: TextMarks): React.ReactNode {
  if (!marks) return text;

  let node: React.ReactNode = text;
  if (marks.code) node = <code>{node}</code>;
  if (marks.italic) node = <em>{node}</em>;
  if (marks.bold) node = <strong>{node}</strong>;
  return node;
}

function renderInline(nodes: InlineNode[]): React.ReactNode {
  return nodes.map((node, i) => {
    if (node.type === 'text') {
      return <span key={i}>{renderTextMarks(node.text, node.marks)}</span>;
    }

    // inlineMath: render via KaTeX
    const html = katex.renderToString(node.latex, {
      ...KATEX_OPTIONS,
      displayMode: false,
    });
    return <span key={i} className="inline-math" dangerouslySetInnerHTML={{ __html: html }} />;
  });
}

/* ------------------------------------------------------------------ */
/*  Block fallback (text extraction)                                   */
/* ------------------------------------------------------------------ */

function extractBlockText(node: BlockNode): string {
  switch (node.type) {
    case 'paragraph':
    case 'heading':
      return node.content
        .map((n) => (n.type === 'text' ? n.text : `$${n.latex}$`))
        .join('');
    case 'codeBlock':
      return node.content.map((n) => n.text).join('\n');
    case 'displayMath':
      return `$$${node.latex}$$`;
    case 'bulletList':
    case 'orderedList':
      return node.content.map((li) => li.content.map(extractBlockText).join('\n')).join('\n');
    case 'blockquote':
      return node.content.map(extractBlockText).join('\n');
    case 'image':
      return '';
  }
}

/* ------------------------------------------------------------------ */
/*  Preview component                                                  */
/* ------------------------------------------------------------------ */

export function NoteDocPreview({ doc }: { doc: NoteDoc }) {
  // Find the first text-ish block (paragraph or heading)
  const firstTextBlock = doc.content.find(
    (b): b is Extract<BlockNode, { type: 'paragraph' | 'heading' }> =>
      b.type === 'paragraph' || b.type === 'heading'
  );

  if (firstTextBlock) {
    // Render inline content of that block
    return (
      <span className="note-doc-preview">
        {renderInline(firstTextBlock.content)}
      </span>
    );
  }

  // Fallback: no text blocks — extract from first block
  const first = doc.content[0];
  if (!first) return <span className="note-doc-preview text-tertiary">—</span>;

  return (
    <span className="note-doc-preview text-tertiary">
      {extractBlockText(first).slice(0, 160)}
    </span>
  );
}