/**
 * @vitest-environment jsdom
 * Regression tests for the NoteImage setImage command (slash-menu image entry).
 * Guards the http(s)-only gate and block placement parity with the `![](url)`
 * markdown input rule.
 */
import { describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import { buildEditorExtensions } from './tiptap-extensions';

function makeEditor() {
  return new Editor({
    extensions: buildEditorExtensions('test'),
    content: { type: 'doc', content: [{ type: 'paragraph' }] },
  });
}

describe('setImage command verification', () => {
  it('inserts an image block for an http(s) url on an empty block', () => {
    const ed = makeEditor();
    const ok = ed.chain().focus().setImage({ src: 'https://example.com/x.png', alt: '' }).run();
    expect(ok).toBe(true);
    const json = ed.getJSON();
    expect(JSON.stringify(json)).toContain('https://example.com/x.png');
    ed.destroy();
  });

  it('rejects javascript: urls', () => {
    const ed = makeEditor();
    const ok = ed.chain().focus().setImage({ src: 'javascript:alert(1)', alt: '' }).run();
    expect(ok).toBe(false);
    expect(JSON.stringify(ed.getJSON())).not.toContain('javascript:');
    ed.destroy();
  });

  it('inserts after a non-empty block', () => {
    const ed = new Editor({
      extensions: buildEditorExtensions('test'),
      content: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hello' }] }],
      },
    });
    const ok = ed.chain().focus().setImage({ src: 'https://example.com/y.png', alt: '' }).run();
    expect(ok).toBe(true);
    const json = ed.getJSON() as { content: Array<{ type: string }> };
    // Trailing empty paragraph is where typing continues — same shape as the
    // markdown input rule's trailing-image branch produces.
    expect(json.content.map((n) => n.type)).toEqual(['paragraph', 'image', 'paragraph']);
    ed.destroy();
  });
});
