/**
 * ProseMirror ↔ frozen union (packages/contracts/src/content.ts) serializer.
 *
 * Two conversions:
 *   `unionToProse` — union → PM JSON, for editor.setContent() on load
 *   `proseToUnion`  — PM JSON → union, the save-time trust boundary
 *
 * The union and the PM schema diverge in three ways:
 *   1. Marks are an object in the union (`{bold?:true}`) but an array in PM (`[{type:'bold'}]`).
 *   2. `HeadingNode.level` is top-level in the union vs `attrs.level` in PM.
 *   3. `inlineMath.latex` / `displayMath.latex` are top-level vs `attrs.latex` in PM.
 *   4. The extension names the block node `blockMath`; the union calls it `displayMath`.
 *
 * `proseToUnion` rejects unexpected node/mark types with a stable catalog key.
 * `unionToProse` omits `content` on empty blocks to match PM's wire format.
 */

import type { BlockNode, InlineNode, NoteDoc, TextMarks, TextNode } from '@neoformuflash/contracts';
import { err, ok } from '@/lib/result';
import type { Result } from '@/lib/result';

/* ------------------------------------------------------------------ */
/*  Minimal PM JSON shape (avoids importing @tiptap/pm)               */
/* ------------------------------------------------------------------ */

interface ProseNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: ProseNode[];
  marks?: Array<{ type: string } & Record<string, unknown>>;
  text?: string;
}

/* ------------------------------------------------------------------ */
/*  Union → ProseMirror (for editor.setContent)                       */
/* ------------------------------------------------------------------ */

/*
 * `unionToProse` is typed against NoteDoc, but its real callers feed it values
 * that are only *shallowly* validated: the AI copilot hands it model output that
 * passed NoteDocSchema (lib/ai/validate-output.ts), a gate that checks node
 * `type` names but not nesting. A `listItem` at the top level, a `bulletList`
 * whose child is a paragraph, or an inline node without `latex` are all typed
 * NoteDoc and all used to fall off the end of a switch or read a missing field —
 * producing `undefined` entries and `attrs.latex: undefined` that were then
 * passed straight into editor.insertContent() and corrupted the document.
 *
 * So every function below is TOTAL: it always returns a well-formed ProseNode,
 * degrading an unrecognised shape to the nearest valid one rather than emitting
 * `undefined`. Structural rejection is the server's job (NoteDocSchema feeds the
 * repair loop); by the time we are building nodes for the editor, the only safe
 * failure mode is degradation.
 */
export function unionToProse(doc: NoteDoc): ProseNode {
  const content = Array.isArray(doc?.content) ? doc.content : [];
  return {
    type: 'doc',
    content: content.map(blockToProse),
  };
}

/** True for the two inline node types, which are invalid at block level. */
function isInlineType(type: unknown): boolean {
  return type === 'text' || type === 'inlineMath';
}

function blockToProse(node: BlockNode): ProseNode {
  // Runtime guard: a null/non-object entry is not representable, so it becomes
  // an empty paragraph instead of `undefined`.
  if (!node || typeof node !== 'object') return { type: 'paragraph' };

  switch (node.type) {
    case 'paragraph': {
      const content = inlinesToProse(node.content ?? []);
      return content.length > 0
        ? { type: 'paragraph', content }
        : { type: 'paragraph' };
    }
    case 'heading': {
      const content = inlinesToProse(node.content ?? []);
      // A missing/out-of-range level would make PM drop the node; clamp to 1–3.
      const raw = typeof node.level === 'number' && Number.isFinite(node.level) ? node.level : 1;
      const level = Math.min(3, Math.max(1, Math.round(raw)));
      const base: ProseNode = { type: 'heading', attrs: { level } };
      if (content.length > 0) base.content = content;
      return base;
    }
    case 'codeBlock': {
      const attrs: Record<string, unknown> = {};
      if (node.language != null) attrs.language = node.language;
      const content = (node.content ?? [])
        .filter((t) => t && typeof t.text === 'string')
        .map((t) => ({ type: 'text', text: t.text }));
      return Object.keys(attrs).length > 0
        ? { type: 'codeBlock', attrs, content }
        : { type: 'codeBlock', content };
    }
    case 'bulletList':
      return { type: 'bulletList', content: (node.content ?? []).map(listItemToProse) };
    case 'orderedList':
      return { type: 'orderedList', content: (node.content ?? []).map(listItemToProse) };
    case 'blockquote':
      return { type: 'blockquote', content: (node.content ?? []).map(blockToProse) };
    case 'displayMath':
      return { type: 'blockMath', attrs: { latex: typeof node.latex === 'string' ? node.latex : '' } };
    case 'image': {
      // Only http(s) URLs reach the editor as image nodes; anything else degrades
      // to an empty paragraph rather than carrying a dangerous src through PM.
      const src = typeof node.src === 'string' && /^https?:\/\//i.test(node.src) ? node.src : '';
      const alt = typeof node.alt === 'string' ? node.alt : '';
      return src.length > 0 ? { type: 'image', attrs: { src, alt } } : { type: 'paragraph' };
    }
    default: {
      /*
       * Not a known block type. The switch above is exhaustive over BlockNode,
       * so TypeScript narrows to `never` here — this arm exists purely for the
       * runtime values the type does not actually guarantee.
       */
      const unknownNode = node as { type?: unknown };
      // An inline node that leaked to block level still carries user content;
      // wrap it in a paragraph rather than discarding it.
      if (isInlineType(unknownNode.type)) {
        const content = inlinesToProse([node as unknown as InlineNode]);
        return content.length > 0 ? { type: 'paragraph', content } : { type: 'paragraph' };
      }
      // A stray listItem: unwrap its blocks so its content survives.
      if (unknownNode.type === 'listItem') {
        const inner = (node as unknown as { content?: BlockNode[] }).content;
        const blocks = Array.isArray(inner) ? inner.map(blockToProse) : [];
        return blocks.length === 1 ? blocks[0]! : { type: 'paragraph' };
      }
      return { type: 'paragraph' };
    }
  }
}

function listItemToProse(item: { type?: string; content?: BlockNode[] }): ProseNode {
  if (!item || typeof item !== 'object') {
    return { type: 'listItem', content: [{ type: 'paragraph' }] };
  }

  /*
   * A list child that is not a listItem (models emit a bare paragraph or text
   * node as a list entry). Wrapping it keeps the content and keeps the list
   * valid; passing it through blockToProse as a listItem's *content* would
   * previously send inline nodes down the block path → `undefined`.
   */
  if (item.type !== 'listItem') {
    // blockToProse already wraps inline nodes in a paragraph and drops empty
    // text, so it produces a valid single block for either case.
    return { type: 'listItem', content: [blockToProse(item as unknown as BlockNode)] };
  }

  const content = (Array.isArray(item.content) ? item.content : []).map(blockToProse);
  // ProseMirror requires listItem to have at least one child node
  if (content.length === 0) {
    return { type: 'listItem', content: [{ type: 'paragraph' }] };
  }
  return { type: 'listItem', content };
}

function inlinesToProse(nodes: InlineNode[]): ProseNode[] {
  /*
   * Empty text nodes are dropped, not kept: ProseMirror's schema.text('')
   * throws ("Empty text nodes are not allowed"), so a degraded node that
   * carries no text must disappear rather than reach the editor.
   */
  return (Array.isArray(nodes) ? nodes : [])
    .map(inlineToProse)
    .filter((n) => n.type !== 'text' || (typeof n.text === 'string' && n.text.length > 0));
}

function inlineToProse(node: InlineNode): ProseNode {
  if (!node || typeof node !== 'object') return { type: 'text', text: '' };

  if (node.type === 'text') {
    const result: ProseNode = { type: 'text', text: typeof node.text === 'string' ? node.text : '' };
    if (node.marks) {
      const marks = marksToProse(node.marks);
      if (marks.length > 0) result.marks = marks;
    }
    return result;
  }

  /*
   * Only emit a math node when there is actually LaTeX to render. `attrs.latex:
   * undefined` reached the editor as a math node with no source, which is what
   * serialized back out as `undefined`.
   */
  if (typeof node.latex === 'string' && node.latex.length > 0) {
    return { type: 'inlineMath', attrs: { latex: node.latex } };
  }

  // Unrecognised inline node: keep any text it happens to carry, else drop to
  // an empty text node — never `undefined`.
  const maybeText = (node as unknown as { text?: unknown }).text;
  return { type: 'text', text: typeof maybeText === 'string' ? maybeText : '' };
}

function marksToProse(marks: TextMarks): Array<{ type: string }> {
  const result: Array<{ type: string }> = [];
  if (marks.bold) result.push({ type: 'bold' });
  if (marks.italic) result.push({ type: 'italic' });
  if (marks.code) result.push({ type: 'code' });
  return result;
}

/* ------------------------------------------------------------------ */
/*  ProseMirror → Union (save-time trust boundary)                    */
/* ------------------------------------------------------------------ */

/**
 * Convert PM JSON (from `editor.getJSON()`) to the frozen union.
 * Any unexpected node or mark type returns a stable catalog-keyed error —
 * never silently drop user content.
 */
export function proseToUnion(prose: unknown): Result<NoteDoc> {
  if (!prose || typeof prose !== 'object') return err('editor.unsupportedBlock');
  const root = prose as Record<string, unknown>;
  if (root.type !== 'doc' || !Array.isArray(root.content))
    return err('editor.unsupportedBlock');

  const blocks: BlockNode[] = [];
  for (const raw of root.content) {
    const block = blockToUnion(raw);
    if (!block.ok) return block;
    blocks.push(block.value);
  }
  return ok({ type: 'doc', content: blocks });
}

function blockToUnion(node: unknown): Result<BlockNode> {
  if (!node || typeof node !== 'object') return err('editor.unsupportedBlock');
  const n = node as Record<string, unknown>;
  const content: ProseNode[] = Array.isArray(n.content) ? n.content : [];
  const attrs = (n.attrs ?? {}) as Record<string, unknown>;

  switch (n.type) {
    case 'paragraph': {
      const inlines = inlinesToUnion(content);
      if (!inlines.ok) return inlines;
      return ok({ type: 'paragraph', content: inlines.value });
    }
    case 'heading': {
      const level = attrs.level;
      if (level !== 1 && level !== 2 && level !== 3)
        return err('editor.unsupportedBlock');
      const inlines = inlinesToUnion(content);
      if (!inlines.ok) return inlines;
      return ok({ type: 'heading', level: level as 1 | 2 | 3, content: inlines.value });
    }
    case 'codeBlock': {
      const language = typeof attrs.language === 'string' ? attrs.language : null;
      const texts = textNodesToUnion(content);
      if (!texts.ok) return texts;
      return ok({ type: 'codeBlock', language, content: texts.value });
    }
    case 'bulletList': {
      const items = listItemsToUnion(content);
      if (!items.ok) return items;
      return ok({ type: 'bulletList', content: items.value });
    }
    case 'orderedList': {
      const items = listItemsToUnion(content);
      if (!items.ok) return items;
      return ok({ type: 'orderedList', content: items.value });
    }
    case 'blockquote': {
      const blocks = blocksToUnion(content);
      if (!blocks.ok) return blocks;
      return ok({ type: 'blockquote', content: blocks.value });
    }
    case 'blockMath': {
      const latex = typeof attrs.latex === 'string' ? attrs.latex : '';
      return ok({ type: 'displayMath', latex });
    }
    case 'image': {
      const src = typeof attrs.src === 'string' ? attrs.src : '';
      const alt = typeof attrs.alt === 'string' ? attrs.alt : '';
      // Trust boundary: reject non-http(s) image sources outright rather than
      // persisting a javascript:/data: src in the doc.
      if (!/^https?:\/\//i.test(src)) return err('editor.unsupportedBlock');
      return ok({ type: 'image', src, alt });
    }
    /*
     * Idempotence: the union's own block-math name, accepted so a doc that has
     * already been converted survives a second pass unchanged.
     *
     * The card path converts twice — MathEditorField.getDoc() returns a union,
     * and the server action re-validates it (D3, untrusted client JSON). Before
     * this case existed the second pass hit `default` and rejected the block, so
     * every equation typed into a card was destroyed on save while notes (which
     * send raw PM JSON, converted once) were fine.
     */
    case 'displayMath': {
      const latex = typeof n.latex === 'string' ? n.latex : '';
      return ok({ type: 'displayMath', latex });
    }
    default:
      return err('editor.unsupportedBlock');
  }
}

function inlinesToUnion(nodes: ProseNode[]): Result<InlineNode[]> {
  const result: InlineNode[] = [];
  for (const n of nodes) {
    const node = inlineToUnion(n);
    if (!node.ok) return node;
    result.push(node.value);
  }
  return ok(result);
}

function inlineToUnion(node: ProseNode): Result<InlineNode> {
  if (node.type === 'text') {
    const text = typeof node.text === 'string' ? node.text : '';
    const marks = marksToUnion(node.marks);
    if (!marks.ok) return marks;
    const hasMarks = Object.keys(marks.value).length > 0;
    const result: { type: 'text'; text: string; marks?: TextMarks } = {
      type: 'text',
      text,
    };
    if (hasMarks) result.marks = marks.value;
    return ok(result);
  }

  if (node.type === 'inlineMath') {
    /*
     * The PM extension carries latex under `attrs.latex`; the union carries it
     * top-level. A doc that has already been converted (e.g. the card save path
     * runs proseToUnion twice — MathEditorField.getDoc() converts once, then
     * the server action re-validates) has no `attrs`, so read from either
     * location. Without this, the second pass silently rewrote every equation
     * to an empty string — that's why card LaTeX vanished on save while notes
     * (converted only once, via saveNote's raw PM JSON) rendered fine.
     */
    const attrs = (node.attrs ?? {}) as Record<string, unknown>;
    const attrLatex = typeof attrs.latex === 'string' ? attrs.latex : undefined;
    // Use `unknown` to avoid TS "conversion may be a mistake" on ProseNode
    const topLatex = typeof (node as unknown as { latex?: unknown }).latex === 'string'
      ? ((node as unknown as { latex: string }).latex)
      : undefined;
    return ok({ type: 'inlineMath', latex: attrLatex ?? topLatex ?? '' });
  }

  return err('editor.unsupportedBlock');
}

function marksToUnion(marks: ProseNode['marks']): Result<TextMarks> {
  if (!marks) return ok({});
  if (!Array.isArray(marks)) return ok({});
  const result: TextMarks = {};
  for (const m of marks) {
    switch (m.type) {
      case 'bold':
        result.bold = true;
        break;
      case 'italic':
        result.italic = true;
        break;
      case 'code':
        result.code = true;
        break;
      default:
        return err('editor.unsupportedBlock');
    }
  }
  return ok(result);
}

function textNodesToUnion(nodes: ProseNode[]): Result<TextNode[]> {
  const result: TextNode[] = [];
  for (const n of nodes) {
    if (!n || n.type !== 'text' || typeof n.text !== 'string')
      return err('editor.unsupportedBlock');
    result.push({ type: 'text', text: n.text });
  }
  return ok(result);
}

function listItemsToUnion(nodes: ProseNode[]): Result<{ type: 'listItem'; content: BlockNode[] }[]> {
  const result: { type: 'listItem'; content: BlockNode[] }[] = [];
  for (const n of nodes) {
    if (!n || n.type !== 'listItem') return err('editor.unsupportedBlock');
    const content: ProseNode[] = Array.isArray(n.content) ? n.content : [];
    const blocks = blocksToUnion(content);
    if (!blocks.ok) return blocks;
    result.push({ type: 'listItem', content: blocks.value });
  }
  return ok(result);
}

function blocksToUnion(nodes: ProseNode[]): Result<BlockNode[]> {
  const result: BlockNode[] = [];
  for (const n of nodes) {
    const block = blockToUnion(n);
    if (!block.ok) return block;
    result.push(block.value);
  }
  return ok(result);
}

/**
 * Extract plain text from a NoteDoc for search indexing / content_text.
 * Recursively walks the doc tree and concatenates text nodes.
 */
export function extractText(doc: NoteDoc): string {
  const parts: string[] = [];

  function walk(nodes: (BlockNode | InlineNode)[]) {
    for (const node of nodes) {
      if (node.type === 'text' && typeof node.text === 'string') {
        parts.push(node.text);
      } else if (node.type === 'inlineMath' && typeof node.latex === 'string') {
        parts.push(node.latex);
      } else if (node.type === 'displayMath' && typeof node.latex === 'string') {
        parts.push(node.latex);
      } else if ('content' in node && Array.isArray(node.content)) {
        walk(node.content as (BlockNode | InlineNode)[]);
      }
    }
  }

  walk(doc.content);
  return parts.join(' ');
}
