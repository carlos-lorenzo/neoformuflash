/**
 * Shared pure renderers for NoteDoc nodes.
 * No CSS side effects — used by NoteDocView (server) and NoteDocPreview (client).
 */

import type { NoteDoc } from '@neoformuflash/contracts';
import type {
  BlockNode,
  InlineNode,
  TextMarks,
} from '@neoformuflash/contracts';
import katex from 'katex';
import { Fragment } from 'react';

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

/**
 * Read a node's LaTeX from either the union shape (`latex` top-level) or the
 * ProseMirror shape (`attrs.latex`).
 *
 * Rows written before the serializer was made idempotent carry the PM shape,
 * and a node whose latex resolved to undefined used to render as an empty
 * KaTeX span — a silently blank equation. Reading both keeps that historical
 * content visible instead of requiring a backfill before anything displays.
 */
function readLatex(node: unknown): string {
  if (!node || typeof node !== 'object') return '';
  const n = node as { latex?: unknown; attrs?: { latex?: unknown } };
  if (typeof n.latex === 'string') return n.latex;
  if (typeof n.attrs?.latex === 'string') return n.attrs.latex;
  return '';
}

function inlineToArray(nodes: InlineNode[] | undefined | null): React.ReactNode[] {
  if (!nodes || !Array.isArray(nodes)) return [];
  return nodes.map((node, i) => {
    if (node.type === 'text') {
      return <span key={i}>{renderTextMarks(node.text, node.marks)}</span>;
    }

    // inlineMath: render via KaTeX server-side
    const html = katex.renderToString(readLatex(node), {
      ...KATEX_OPTIONS,
      displayMode: false,
    });
    return <span key={i} className="inline-math" dangerouslySetInnerHTML={{ __html: html }} />;
  });
}

/* ------------------------------------------------------------------ */
/*  Block rendering                                                    */
/* ------------------------------------------------------------------ */

function renderBlock(node: BlockNode): React.ReactNode {
  switch (node.type) {
    case 'paragraph': {
      const content = inlineToArray(node.content);
      return content.length > 0
        ? <p key="p">{content}</p>
        : <p key="p"><br /></p>;
    }
    case 'heading': {
      const content = inlineToArray(node.content);
      // Render heading as styled elements since dynamic tag doesn't work in shared code
      return <p key={`h${node.level}`} className="note-heading">{content}</p>;
    }
    case 'codeBlock': {
      const code = (node.content ?? []).map((n) => n.text).join('\n');
      return (
        <pre key="code"><code>{code}</code></pre>
      );
    }
    case 'bulletList': {
      return (
        <ul key="ul">
          {node.content.map((li, i) => (
            <li key={i}>
              {li.content?.map((block, j) => (
                <Fragment key={j}>{renderBlock(block)}</Fragment>
              )) ?? []}
            </li>
          ))}
        </ul>
      );
    }
    case 'orderedList': {
      return (
        <ol key="ol">
          {node.content.map((li, i) => (
            <li key={i}>
              {li.content?.map((block, j) => (
                <Fragment key={j}>{renderBlock(block)}</Fragment>
              )) ?? []}
            </li>
          ))}
        </ol>
      );
    }
    case 'blockquote': {
      return (
        <blockquote key="bq">
          {node.content?.map((block, i) => (
            <Fragment key={i}>{renderBlock(block)}</Fragment>
          )) ?? []}
        </blockquote>
      );
    }
    case 'displayMath': {
      const html = katex.renderToString(readLatex(node), {
        ...KATEX_OPTIONS,
        displayMode: true,
      });
      return <div key="dm" className="display-math" dangerouslySetInnerHTML={{ __html: html }} />;
    }
    case 'image': {
      // Only http(s) sources are renderable — the serializer already rejects the
      // rest at the trust boundary, so a malformed row simply renders nothing.
      if (typeof node.src !== 'string' || !/^https?:\/\//i.test(node.src)) return null;
      // Docs carry arbitrary remote URLs from user-authored markdown — no fixed
      // dimensions, so next/image cannot optimise them here.
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key="img"
          src={node.src}
          alt={typeof node.alt === 'string' ? node.alt : ''}
          loading="lazy"
          className="note-image"
        />
      );
    }
    /*
     * The switch is exhaustive over BlockNode, so an unrecognised type used to
     * fall out returning undefined — the node vanished with no error anywhere.
     * `mathDisplay` (the PM-ish name written by older card saves and by the e2e
     * seed helper) is the case that actually reached production data, so it is
     * mapped to display math rather than dropped.
     */
    default: {
      const unknownNode = node as { type?: string };
      if (unknownNode.type === 'mathDisplay' || unknownNode.type === 'blockMath') {
        const html = katex.renderToString(readLatex(node), {
          ...KATEX_OPTIONS,
          displayMode: true,
        });
        return <div key="dm" className="display-math" dangerouslySetInnerHTML={{ __html: html }} />;
      }
      return null;
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

export { inlineToArray, renderBlock };

/** Renders the full NoteDoc (all blocks) — used by NoteDocView. */
export function renderNoteDoc(doc: NoteDoc): React.ReactNode {
  return (
    <div className="note-doc-view">
      {doc.content.map((block, i) => (
        <Fragment key={i}>{renderBlock(block)}</Fragment>
      ))}
    </div>
  );
}