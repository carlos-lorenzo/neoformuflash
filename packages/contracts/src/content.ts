/*
 * The Tiptap node union for `notes.content_json`. Frozen as of phase 01 — see
 * specs/phase-02-editor.md "Contract changes: None."
 */

export interface TextMarks {
  bold?: true;
  italic?: true;
  code?: true;
}

export interface TextNode {
  type: 'text';
  text: string;
  marks?: TextMarks;
}

export interface InlineMathNode {
  type: 'inlineMath';
  latex: string;
}

export type InlineNode = TextNode | InlineMathNode;

export interface DisplayMathNode {
  type: 'displayMath';
  latex: string;
}

export interface ParagraphNode {
  type: 'paragraph';
  content: InlineNode[];
}

export interface HeadingNode {
  type: 'heading';
  level: 1 | 2 | 3;
  content: InlineNode[];
}

export interface CodeBlockNode {
  type: 'codeBlock';
  language: string | null;
  content: TextNode[];
}

export interface ListItemNode {
  type: 'listItem';
  content: BlockNode[];
}

export interface BulletListNode {
  type: 'bulletList';
  content: ListItemNode[];
}

export interface OrderedListNode {
  type: 'orderedList';
  content: ListItemNode[];
}

export interface BlockquoteNode {
  type: 'blockquote';
  content: BlockNode[];
}

export type BlockNode =
  | ParagraphNode
  | HeadingNode
  | CodeBlockNode
  | BulletListNode
  | OrderedListNode
  | BlockquoteNode
  | DisplayMathNode;

export interface NoteDoc {
  type: 'doc';
  content: BlockNode[];
}

function extractInline(nodes: InlineNode[]): string {
  return nodes
    .map((n) => (n.type === 'text' ? n.text : `$${n.latex}$`))
    .join('');
}

function extractBlock(node: BlockNode): string {
  switch (node.type) {
    case 'paragraph':
    case 'heading':
      return extractInline(node.content);
    case 'codeBlock':
      return node.content.map((n) => n.text).join('');
    case 'displayMath':
      return `$$${node.latex}$$`;
    case 'bulletList':
    case 'orderedList':
      return node.content.map((li) => li.content.map(extractBlock).join('\n')).join('\n');
    case 'blockquote':
      return node.content.map(extractBlock).join('\n');
  }
}

/** Renders math nodes as their LaTeX source (phase 02 AC8). */
export function extractText(doc: NoteDoc): string {
  return doc.content.map(extractBlock).join('\n');
}
