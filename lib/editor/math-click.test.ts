/**
 * Tests for findMathAtClick (lib/editor/math-click.ts).
 *
 * The hit-test must return a position that satisfies the math extension's
 * updateInlineMath/updateBlockMath contracts: doc.nodeAt(pos) must resolve
 * to the math node itself. Previously the block branch returned
 * $pos.before(depth) + 1, which landed *inside* the node and caused the
 * update command to bail out silently.
 */

// @vitest-environment jsdom
import { describe, expect, it, afterEach } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { InlineMath, BlockMath } from '@tiptap/extension-mathematics';
import { findMathAtClick } from './math-click';

const KATEX_OPTIONS = { throwOnError: false, trust: false, strict: false };

let editor: Editor | null = null;
let container: HTMLDivElement | null = null;

function createEditor(content?: import('@tiptap/core').Content): Editor {
  container = document.createElement('div');
  document.body.appendChild(container);
  editor = new Editor({
    element: container,
    extensions: [
      StarterKit,
      InlineMath.extend({ addInputRules() { return []; } }).configure({ katexOptions: { ...KATEX_OPTIONS } }),
      BlockMath.extend({ addInputRules() { return []; } }).configure({ katexOptions: { ...KATEX_OPTIONS } }),
    ],
    content,
  });
  return editor;
}

afterEach(() => {
  editor?.destroy();
  container?.remove();
  editor = null;
  container = null;
});

describe('lib/editor/math-click — hit test returns node-resolving positions', () => {
  it('blockMath: returned pos makes doc.nodeAt(pos) the blockMath node', () => {
    const ed = createEditor({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Before' }] },
        { type: 'blockMath', attrs: { latex: 'E=mc^2' } },
        { type: 'paragraph', content: [{ type: 'text', text: 'After' }] },
      ],
    });

    // The function is designed to handle clicks on the *rendered KaTeX content*
    // (inner spans), not the node view's outer DOM. The click target would be
    // a KaTeX span deep inside. Walk up to the wrapper and call posAtDOM.
    const katexSpan = container!.querySelector('.katex-html');
    expect(katexSpan).not.toBeNull();

    // Simulate a click on the KaTeX span - findMathAtClick will walk up to the wrapper
    const hit = findMathAtClick(ed.view, 0, katexSpan!);

    expect(hit).not.toBeNull();
    expect(hit!.mode).toBe('display');
    expect(hit!.node.type.name).toBe('blockMath');

    // The critical invariant: doc.nodeAt(pos) === the math node
    const resolvedNode = ed.state.doc.nodeAt(hit!.pos);
    expect(resolvedNode).not.toBeNull();
    expect(resolvedNode!.type.name).toBe('blockMath');
  });

  it('inlineMath: returned pos makes doc.nodeAt(pos) the inlineMath node', () => {
    const ed = createEditor({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Start ' },
            { type: 'inlineMath', attrs: { latex: 'x^2' } },
            { type: 'text', text: ' end' },
          ],
        },
      ],
    });

    // Click on the inner KaTeX span for inline math
    const katexSpan = container!.querySelector('[data-type="inline-math"] .katex-html');
    expect(katexSpan).not.toBeNull();

    const hit = findMathAtClick(ed.view, 0, katexSpan!);

    expect(hit).not.toBeNull();
    expect(hit!.mode).toBe('inline');
    expect(hit!.node.type.name).toBe('inlineMath');

    // Critical invariant: doc.nodeAt(pos) === the math node
    const resolvedNode = ed.state.doc.nodeAt(hit!.pos);
    expect(resolvedNode).not.toBeNull();
    expect(resolvedNode!.type.name).toBe('inlineMath');
  });
});