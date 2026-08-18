/**
 * Derive a note title from its TipTap/NoteDoc content.
 *
 * Walks top-level blocks in order and returns the text content of the
 * first non-empty block (heading, paragraph, or any textblock).
 * Falls back to the literal 'Untitled' when the document has no text.
 *
 * This is a pure function with no side effects — unit-testable and
 * reusable on both client (editor autosave) and server (saveNote action).
 */

export const UNTITLED_TITLE = 'Untitled';

/**
 * The structural shape both the ProseMirror JSON and the NoteDoc union satisfy.
 * Deliberately loose: this helper runs against `editor.state.doc.toJSON()` on the
 * client and the validated union on the server, and only reads `type`/`text`/
 * `latex`/`content`.
 */
type TextishNode = {
  type?: string;
  text?: string;
  latex?: string;
  content?: readonly unknown[];
};

/**
 * Extract plain text from a TipTap/NoteDoc node recursively.
 */
function nodeToText(node: unknown): string {
  if (typeof node !== 'object' || node === null) return '';
  const n = node as TextishNode;

  if (n.type === 'text') {
    return n.text ?? '';
  }
  // Math nodes carry their source in `latex` (union) or `attrs.latex` (PM JSON).
  if (n.type === 'inlineMath' || n.type === 'displayMath' || n.type === 'blockMath') {
    const attrs = (node as { attrs?: { latex?: string } }).attrs;
    return n.latex ?? attrs?.latex ?? '';
  }
  if (Array.isArray(n.content)) {
    return n.content.map(nodeToText).join('');
  }
  return '';
}

/**
 * Check if a block node has any non-whitespace text content.
 */
function isBlockNonEmpty(block: unknown): boolean {
  return nodeToText(block).trim().length > 0;
}

/**
 * Derive a title from a note document.
 *
 * Accepts both the NoteDoc union (server, post-`proseToUnion`) and raw
 * ProseMirror JSON (client, `editor.state.doc.toJSON()`).
 *
 * @param doc — The note document
 * @returns The derived title, or UNTITLED_TITLE if no non-empty block exists
 */
export function deriveTitle(doc: { type: string; content?: readonly unknown[] }): string {
  if (!Array.isArray(doc?.content)) {
    return UNTITLED_TITLE;
  }

  for (const block of doc.content) {
    if (isBlockNonEmpty(block)) {
      const text = nodeToText(block).trim();
      // Cap at reasonable length for UI display
      return text.length > 200 ? text.slice(0, 200).trimEnd() + '…' : text;
    }
  }

  return UNTITLED_TITLE;
}