/**
 * @vitest-environment jsdom
 *
 * The spec's "write the test first" instruction (specs/phase-02-editor.md):
 * "Undo across a math node boundary is a classic ProseMirror trap. Write the
 * test first." This lives in the spike so the extension + StarterKit history
 * are proven to survive a replace that crosses an atom node, before the editor
 * is built on top. If either test fails, STOP and reconsider the approach.
 */

import { describe, expect, it, afterEach } from 'vitest';
import { Editor } from '@tiptap/core';
import type { Content } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { Mathematics } from '@tiptap/extension-mathematics';
import { TextSelection } from '@tiptap/pm/state';
import type { KatexOptions } from 'katex';

/*
 * KaTeX runs with trust off so \href / \includegraphics cannot smuggle markup
 * (specs/EVOLUTION.md names Tiptap as the anticipated XSS vector).
 */
const KATEX_OPTIONS: KatexOptions = { throwOnError: false, trust: false, strict: false };

let editor: Editor | null = null;
let container: HTMLDivElement | null = null;

function createEditor(content: Content): Editor {
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

/** Select the whole doc, replace it with plain text, then undo once. */
function replaceAllAndUndo(ed: Editor, replacement: string): void {
  const { state } = ed;
  ed.view.dispatch(
    state.tr.setSelection(TextSelection.create(state.doc, 0, state.doc.content.size))
  );
  ed.commands.insertContent(replacement);
  ed.commands.undo();
}

describe('undo across a math node boundary', () => {
  it('restores an inline math node after a replace that crosses it', () => {
    const ed = createEditor({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'ab' },
            { type: 'inlineMath', attrs: { latex: 'x' } },
            { type: 'text', text: 'cd' },
          ],
        },
      ],
    });
    const original = ed.getJSON();

    replaceAllAndUndo(ed, 'hello');

    expect(ed.getJSON()).toEqual(original);
  });

  it('restores a block math node after a replace that crosses it', () => {
    const ed = createEditor({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'ab' }] },
        { type: 'blockMath', attrs: { latex: 'x' } },
        { type: 'paragraph', content: [{ type: 'text', text: 'cd' }] },
      ],
    });
    const original = ed.getJSON();

    replaceAllAndUndo(ed, 'hello');

    expect(ed.getJSON()).toEqual(original);
  });
});
