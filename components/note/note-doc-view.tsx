/**
 * Read-only server-side renderer for NoteDoc (the frozen Tiptap content union).
 *
 * Phase 04 reuses this for public note rendering. The component is a Server
 * Component: it uses `katex.renderToString` (not the client-side katex-client
 * import) and renders the NoteDoc union directly into JSX. No Tiptap at all.
 *
 * KaTeX optical calibration: `.katex { font-size: 1.03em }` is set in the
 * card/flashcard reading surface (design-system §2), not here — NoteDocView
 * renders at the reading scale and lets the parent apply the calibration.
 *
 * Touch only for new NoteDoc node types added to the contracts package.
 */

import type { NoteDoc } from '@neoformuflash/contracts';
import type {
  BlockNode,
  InlineNode,
  TextMarks,
} from '@neoformuflash/contracts';
import katex from 'katex';

/* ------------------------------------------------------------------ */
/*  KaTeX options                                                      */
/* ------------------------------------------------------------------ */

const KATEX_OPTIONS = {
  throwOnError: false,
  trust: false,
  strict: false,
} as const;

/* ------------------------------------------------------------------ */
/*  Inline rendering                                                   */
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

    // inlineMath: render via KaTeX server-side
    const html = katex.renderToString(node.latex, {
      ...KATEX_OPTIONS,
      displayMode: false,
    });
    return (
      <span
        key={i}
        className="inline-math"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  });
}

/* ------------------------------------------------------------------ */
/*  Block rendering                                                    */
/* ------------------------------------------------------------------ */

function renderBlock(node: BlockNode): React.ReactNode {
  switch (node.type) {
    case 'paragraph':
      return <p>{renderInline(node.content)}</p>;

    case 'heading':
      switch (node.level) {
        case 1:
          return <h1>{renderInline(node.content)}</h1>;
        case 2:
          return <h2>{renderInline(node.content)}</h2>;
        case 3:
          return <h3>{renderInline(node.content)}</h3>;
      }
      break;

    case 'codeBlock':
      return (
        <pre>
          <code>{node.content.map((n) => n.text).join('')}</code>
        </pre>
      );

    case 'bulletList':
      return (
        <ul>
          {node.content.map((li, i) => (
            <li key={i}>{li.content.map((block, j) => (
              <span key={j}>{renderBlock(block)}</span>
            ))}</li>
          ))}
        </ul>
      );

    case 'orderedList':
      return (
        <ol>
          {node.content.map((li, i) => (
            <li key={i}>{li.content.map((block, j) => (
              <span key={j}>{renderBlock(block)}</span>
            ))}</li>
          ))}
        </ol>
      );

    case 'blockquote':
      return (
        <blockquote>
          {node.content.map((block, i) => (
            <span key={i}>{renderBlock(block)}</span>
          ))}
        </blockquote>
      );

    case 'displayMath': {
      const html = katex.renderToString(node.latex, {
        ...KATEX_OPTIONS,
        displayMode: true,
      });
      return (
        <div
          className="display-math"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      );
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Public component                                                   */
/* ------------------------------------------------------------------ */

/**
 * Render a NoteDoc as read-only HTML. Handles: prose, headings, lists,
 * code blocks, blockquotes, inline math, display math, and empty docs.
 *
 * The parent component is responsible for the reading surface styling
 * (Source Serif 4, reading scale, KaTeX optical calibration at 1.03em).
 */
export function NoteDocView({ doc }: { doc: NoteDoc }) {
  if (doc.content.length === 0) {
    return null;
  }

  return (
    <div className="note-doc-view">
      {doc.content.map((block, i) => (
        <span key={i}>{renderBlock(block)}</span>
      ))}
    </div>
  );
}
