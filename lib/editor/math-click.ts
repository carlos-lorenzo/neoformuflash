/**
 * Hit-test helper for clicking a rendered math node to edit it.
 *
 * Both NoteEditor and MathEditorField wire this into `editorProps.handleClick`
 * — an event handler, where reading refs is legal — rather than configuring a
 * ref-reading callback into the memoized extension builder (which trips the
 * react-hooks/refs rule and races the node views).
 *
 * The math extensions' node views only attach their own click listeners when
 * `options.onClick` is set; with it unset, clicks bubble to the editor and
 * arrive here. ProseMirror's handleClick provides a `pos` already computed
 * from the DOM event, and `view.posAtDOM` refines it to the exact clicked
 * element.
 *
 * IMPORTANT: Clicks land on KaTeX's inner spans (glyphs), not the math node
 * wrapper. We walk up to the nearest wrapper (`[data-type="block-math"]` or
 * `[data-type="inline-math"]`) and call posAtDOM on THAT element so the
 * position resolves to the node itself — not a child glyph.
 */

import type { EditorView } from '@tiptap/pm/view';
import type { Node } from '@tiptap/pm/model';

export type MathHit = {
  node: Node;
  /** Position of the math node in the document (for updateInlineMath/updateBlockMath). */
  pos: number;
  mode: 'inline' | 'display';
};

/**
 * Find the math node under a click. Returns null when the click is not on
 * (or inside) a math node.
 */
export function findMathAtClick(view: EditorView, clickPos: number, target: EventTarget | null): MathHit | null {
  const docSize = view.state.doc.content.size;
  let pos = clickPos;

  // Walk up from the clicked target to the nearest math node wrapper.
  // KaTeX renders inside the wrapper, so the raw target is often a <span>
  // deep in the glyph tree. posAtDOM on the wrapper yields the node position.
  if (target instanceof Element) {
    const wrapper = target.closest('[data-type="block-math"], [data-type="inline-math"]');
    const element = wrapper ?? target;
    try {
      pos = view.posAtDOM(element, 0);
    } catch {
      // posAtDOM can throw on detached/foreign nodes — fall back to clickPos.
    }
  }
  if (pos < 0) pos = 0;
  if (pos > docSize) pos = docSize;

  const $pos = view.state.doc.resolve(pos);

  // Block math sits on the depth chain — walk ancestors.
  // First check nodes on the depth chain (for clicks inside nested structures).
  for (let depth = $pos.depth; depth >= 0; depth--) {
    const node = $pos.node(depth);
    if (node.type.name === 'blockMath') {
      // $pos.before(depth) IS the position of the node.
      // updateBlockMath({pos}) does doc.nodeAt(pos) and expects the math node.
      return { node, pos: $pos.before(depth), mode: 'display' };
    }
  }

  // If we're at depth 0 (doc level), the click may be on a block node's wrapper.
  // posAtDOM on the wrapper returns the position *before* that block node.
  // Check the child at the current index.
  if ($pos.depth === 0) {
    const index = $pos.index(0);
    const child = $pos.node(0).child(index);
    if (child && child.type.name === 'blockMath') {
      // The node position is $pos.pos (which equals $pos.before(0) + offset).
      // For a block node at index i, its position is the sum of nodeSizes of previous siblings + 1.
      // But simpler: $pos.pos IS the position before this child node.
      return { node: child, pos: $pos.pos, mode: 'display' };
    }
  }

  // Inline math lives inside a text block, not on the depth chain — scan the
  // parent textblock's children for one spanning the click position.
  const parent = $pos.parent;
  if (parent.isTextblock) {
    const base = $pos.start();
    let hit: MathHit | null = null;
    parent.forEach((child, offset) => {
      if (child.type.name !== 'inlineMath') return;
      const start = base + offset;
      // nodeSize of an inline node is 2 (one token) — the click lands inside.
      if (pos >= start && pos <= start + child.nodeSize) {
        hit = { node: child, pos: start, mode: 'inline' };
      }
    });
    return hit;
  }

  return null;
}