/**
 * Markdown-lite → NoteDoc parser for AI copilot text output.
 *
 * The copilot's non-`generate` actions (explain / summarize / rephrase /
 * continue / fix_latex) return a plain string, and every provider prompt in
 * lib/ai/providers/* instructs the model to write inline math as `$…$` and
 * display math as `$$…$$`. Tiptap parses a bare string as HTML, and the math
 * input rules are deliberately disabled in lib/editor/tiptap-extensions.ts so
 * the MathInput panel stays the only path that can commit LaTeX — so that
 * string reached the document as literal dollar-sign text with no math nodes.
 *
 * This module closes that gap: it converts the model's markdown into the frozen
 * union (packages/contracts/src/content.ts), which `unionToProse` then turns
 * into real ProseMirror nodes. AI output and hand-typed content end up as the
 * same node types, rendered by the same KaTeX pipeline.
 *
 * Scope is deliberately the subset the prompts ask for and the union can hold —
 * not CommonMark. Anything unrecognised degrades to literal text rather than
 * being dropped, so no model output can silently vanish.
 */

import type {
  BlockNode,
  InlineNode,
  ListItemNode,
  NoteDoc,
  TextMarks,
  TextNode,
} from '@neoformuflash/contracts';

/* ------------------------------------------------------------------ */
/*  Inline                                                             */
/* ------------------------------------------------------------------ */

/** Characters a leading backslash turns into a literal. */
const ESCAPABLE = new Set(['$', '*', '_', '`', '\\']);

/**
 * Index of the next `$` not preceded by a backslash, or -1.
 */
function findClosingDollar(src: string, from: number): number {
  for (let i = from; i < src.length; i++) {
    if (src[i] === '\\') {
      i++; // skip the escaped character
      continue;
    }
    if (src[i] === '$') return i;
  }
  return -1;
}

/**
 * Whether `$…$` content is plausibly math rather than a currency pair.
 *
 * "it costs $5 and $10" would otherwise parse as math with the body "5 and ".
 * KaTeX's own auto-render uses the same guard: a real inline formula is never
 * empty and never bounded by whitespace.
 */
function isInlineMathBody(body: string): boolean {
  return body.length > 0 && !/^\s/.test(body) && !/\s$/.test(body);
}

function parseInline(src: string, marks: TextMarks = {}): InlineNode[] {
  const out: InlineNode[] = [];
  let buf = '';

  function flush() {
    if (buf.length === 0) return;
    const node: TextNode = { type: 'text', text: buf };
    if (Object.keys(marks).length > 0) node.marks = { ...marks };
    out.push(node);
    buf = '';
  }

  let i = 0;
  while (i < src.length) {
    const ch = src[i];

    // Backslash escape — the next character is literal.
    const nextChar = src[i + 1];
    if (ch === '\\' && nextChar && ESCAPABLE.has(nextChar)) {
      buf += nextChar;
      i += 2;
      continue;
    }

    // Code span. Its body is literal: no math, no emphasis inside.
    if (ch === '`') {
      const end = src.indexOf('`', i + 1);
      if (end > i + 1) {
        flush();
        out.push({
          type: 'text',
          text: src.slice(i + 1, end),
          marks: { ...marks, code: true },
        });
        i = end + 1;
        continue;
      }
    }

    /*
     * `$$…$$` inside a line. A display block on its own line is handled by the
     * block splitter; reaching here means it is mixed with prose, and the union
     * has no inline-display node — so it degrades to inlineMath rather than
     * being dropped or splitting the paragraph.
     */
    if (ch === '$' && src[i + 1] === '$') {
      const end = src.indexOf('$$', i + 2);
      if (end > i + 1) {
        const latex = src.slice(i + 2, end).trim();
        if (latex.length > 0) {
          flush();
          out.push({ type: 'inlineMath', latex });
        }
        i = end + 2;
        continue;
      }
    }

    // `$…$` inline math.
    if (ch === '$') {
      const end = findClosingDollar(src, i + 1);
      if (end !== -1) {
        const body = src.slice(i + 1, end);
        if (isInlineMathBody(body)) {
          flush();
          out.push({ type: 'inlineMath', latex: body });
          i = end + 1;
          continue;
        }
      }
    }

    // `**bold**`
    if (ch === '*' && src[i + 1] === '*') {
      const end = src.indexOf('**', i + 2);
      if (end > i + 1) {
        flush();
        out.push(...parseInline(src.slice(i + 2, end), { ...marks, bold: true }));
        i = end + 2;
        continue;
      }
    }

    // `*italic*` / `_italic_`
    if (ch === '*' || ch === '_') {
      const end = src.indexOf(ch, i + 1);
      if (end > i + 1) {
        flush();
        out.push(...parseInline(src.slice(i + 1, end), { ...marks, italic: true }));
        i = end + 1;
        continue;
      }
    }

    // Unmatched delimiter, or ordinary character — literal.
    buf += ch;
    i++;
  }

  flush();
  return out;
}

/* ------------------------------------------------------------------ */
/*  Block                                                              */
/* ------------------------------------------------------------------ */

const HEADING_RE = /^(#{1,6})\s+(.*)$/;
const BULLET_RE = /^\s*[-*+]\s+(.*)$/;
const ORDERED_RE = /^\s*\d+[.)]\s+(.*)$/;
const BLOCKQUOTE_RE = /^\s*>\s?(.*)$/;
const FENCE_RE = /^\s*```\s*(\S*)\s*$/;
const DISPLAY_ONE_LINE_RE = /^\s*\$\$(.+?)\$\$\s*$/;
const DISPLAY_OPEN_RE = /^\s*\$\$\s*$/;

function paragraphFrom(lines: string[]): BlockNode | null {
  const content = parseInline(lines.join(' ').trim());
  return content.length > 0 ? { type: 'paragraph', content } : null;
}

function parseBlocks(lines: string[]): BlockNode[] {
  const out: BlockNode[] = [];
  let i = 0;

  while (i < lines.length) {
    // Narrowing: after `i < lines.length`, lines[i] is string, not string | undefined.
    // TypeScript still requires an explicit check; we use a const to satisfy it.
    const line = lines[i]!;

    // Blank
    if (line.trim() === '') {
      i++;
      continue;
    }

    // Fenced code block. An unterminated fence runs to the end of input rather
    // than falling back to paragraphs — the model opened a code block, so the
    // remaining lines are code.
    const fence = line.match(FENCE_RE);
    if (fence) {
      const language = fence[1] || null;
      const body: string[] = [];
      i++;
      while (i < lines.length) {
        const nextLine = lines[i]!;
        if (FENCE_RE.test(nextLine)) break;
        body.push(nextLine);
        i++;
      }
      i++; // consume the closing fence (no-op past the end)
      const text = body.join('\n');
      out.push({
        type: 'codeBlock',
        language,
        content: text.length > 0 ? [{ type: 'text', text }] : [],
      });
      continue;
    }

    // `$$…$$` alone on one line
    const oneLineMath = line.match(DISPLAY_ONE_LINE_RE);
    if (oneLineMath && oneLineMath[1]) {
      const latex = oneLineMath[1].trim();
      if (latex.length > 0) out.push({ type: 'displayMath', latex });
      i++;
      continue;
    }

    // `$$` … `$$` spanning several lines
    if (DISPLAY_OPEN_RE.test(line)) {
      const body: string[] = [];
      i++;
      while (i < lines.length) {
        const nextLine = lines[i]!;
        if (DISPLAY_OPEN_RE.test(nextLine)) break;
        body.push(nextLine);
        i++;
      }
      i++; // consume the closing `$$`
      const latex = body.join('\n').trim();
      if (latex.length > 0) out.push({ type: 'displayMath', latex });
      continue;
    }

    // Heading. The union stops at level 3, so deeper headings clamp rather than
    // rendering their hashes as literal text.
    const heading = line.match(HEADING_RE);
    if (heading && heading[1] && heading[2]) {
      const level = Math.min(heading[1].length, 3) as 1 | 2 | 3;
      out.push({ type: 'heading', level, content: parseInline(heading[2].trim()) });
      i++;
      continue;
    }

    // Blockquote — consecutive `>` lines, re-parsed as blocks.
    if (BLOCKQUOTE_RE.test(line)) {
      const body: string[] = [];
      while (i < lines.length) {
        const currentLine = lines[i]!;
        const m = currentLine.match(BLOCKQUOTE_RE);
        if (!m || !m[1]) break;
        body.push(m[1]);
        i++;
      }
      const content = parseBlocks(body);
      if (content.length > 0) out.push({ type: 'blockquote', content });
      continue;
    }

    // Lists. Nesting is not modelled: an indented item joins the flat list.
    if (BULLET_RE.test(line) || ORDERED_RE.test(line)) {
      const ordered = !BULLET_RE.test(line) && ORDERED_RE.test(line);
      const re = ordered ? ORDERED_RE : BULLET_RE;
      const items: ListItemNode[] = [];

      while (i < lines.length) {
        const currentLine = lines[i]!;
        const m = currentLine.match(re);
        if (!m || !m[1]) break;
        const content = parseInline(m[1].trim());
        items.push({
          type: 'listItem',
          content: [{ type: 'paragraph', content }],
        });
        i++;
      }

      if (items.length > 0) {
        out.push(ordered ? { type: 'orderedList', content: items } : { type: 'bulletList', content: items });
      }
      continue;
    }

    // Paragraph — consecutive lines until a blank line or another block starts.
    const para: string[] = [];
    while (i < lines.length) {
      const l = lines[i]!;
      if (
        l.trim() === '' ||
        FENCE_RE.test(l) ||
        HEADING_RE.test(l) ||
        BULLET_RE.test(l) ||
        ORDERED_RE.test(l) ||
        BLOCKQUOTE_RE.test(l) ||
        DISPLAY_ONE_LINE_RE.test(l) ||
        DISPLAY_OPEN_RE.test(l)
      ) {
        break;
      }
      para.push(l);
      i++;
    }
    const block = paragraphFrom(para);
    if (block) out.push(block);
  }

  return out;
}

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

/**
 * Convert the copilot's markdown text into a NoteDoc.
 *
 * Total: never throws, never returns an error. Unrecognised syntax is kept as
 * literal text, so the worst case is unstyled prose rather than lost content.
 */
export function mdToNoteDoc(text: string): NoteDoc {
  /*
   * Guard the input type, not just its syntax. The copilot text path handed
   * this `undefined` whenever the model's answer came back without the `text`
   * field, and `.replace` threw — breaking the preview render rather than
   * degrading. "Never throws" has to hold for the argument as well.
   */
  if (typeof text !== 'string') return { type: 'doc', content: [] };
  const normalized = text.replace(/\r\n?/g, '\n');
  return { type: 'doc', content: parseBlocks(normalized.split('\n')) };
}
