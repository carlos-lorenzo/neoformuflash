/**
 * @vitest-environment jsdom
 *
 * Phase-02 spike (specs/phase-02-editor.md): a bare Tiptap instance using the
 * official @tiptap/extension-mathematics. Proves inline and block math nodes
 * round-trip through JSON and that updating a node's LaTeX re-renders live —
 * the two behaviours MathInput's commit flow depends on. If this is not clean,
 * STOP and reconsider before building anything on top.
 */

import { describe, expect, it, afterEach } from 'vitest';
import { Editor } from '@tiptap/core';
import type { Content } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { Mathematics } from '@tiptap/extension-mathematics';
import type { KatexOptions } from 'katex';

/*
 * KaTeX runs with trust off so \href / \includegraphics cannot smuggle markup
 * (specs/EVOLUTION.md names Tiptap as the anticipated XSS vector).
 */
const KATEX_OPTIONS: KatexOptions = { throwOnError: false, trust: false, strict: false };

let editor: Editor | null = null;
let container: HTMLDivElement | null = null;

function createEditor(content?: Content): Editor {
  container = document.createElement('div');
  document.body.appendChild(container);
  editor = new Editor({
    element: container,
    extensions: [StarterKit, Mathematics.configure({ katexOptions: { ...KATEX_OPTIONS } })],
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

/** The position of the first node of the given type, or -1. */
function mathPos(ed: Editor, nodeType: string): number {
  let pos = -1;
  ed.state.doc.descendants((node, p) => {
    if (node.type.name === nodeType) {
      pos = p;
      return false;
    }
    return true;
  });
  return pos;
}

describe('Tiptap math spike', () => {
  it('round-trips an inline math node through JSON', () => {
    const ed = createEditor();
    ed.commands.insertInlineMath({ latex: '\\alpha' });

    const json = ed.getJSON();
    expect(json).toEqual({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'inlineMath', attrs: { latex: '\\alpha' } }] },
      ],
    });

    // Rebuild from that JSON: the node and its rendered DOM survive.
    ed.commands.setContent(json);
    expect(ed.getJSON()).toEqual(json);
    const dom = ed.view.dom.querySelector('[data-type="inline-math"]');
    expect(dom).not.toBeNull();
    expect(dom?.getAttribute('data-latex')).toBe('\\alpha');
  });

  it('round-trips a block math node through JSON', () => {
    const ed = createEditor();
    ed.commands.insertBlockMath({ latex: '\\sum_{i=1}^{n} i' });

    const json = ed.getJSON();
    // Inserting at the start of an empty paragraph replaces that paragraph with
    // the equation and leaves a fresh one below for continuing.
    expect(json).toEqual({
      type: 'doc',
      content: [
        { type: 'blockMath', attrs: { latex: '\\sum_{i=1}^{n} i' } },
        { type: 'paragraph' },
      ],
    });

    ed.commands.setContent(json);
    expect(ed.getJSON()).toEqual(json);
    expect(ed.view.dom.querySelector('[data-type="block-math"]')).not.toBeNull();
  });

  it('re-renders live when a node latex is updated', () => {
    const ed = createEditor();
    ed.commands.insertInlineMath({ latex: '\\alpha' });

    const pos = mathPos(ed, 'inlineMath');
    expect(pos).toBeGreaterThan(-1);

    const updated = ed.commands.updateInlineMath({ latex: '\\beta', pos });
    expect(updated).toBe(true);

    const dom = ed.view.dom.querySelector('[data-type="inline-math"]');
    expect(dom?.getAttribute('data-latex')).toBe('\\beta');
    expect(dom?.querySelector('.katex')).not.toBeNull();
  });
});
