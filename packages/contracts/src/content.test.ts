import { describe, expect, it } from 'vitest';
import { extractText, type NoteDoc } from './content';

describe('extractText', () => {
  it('renders every node type, with math nodes as LaTeX source', () => {
    const doc: NoteDoc = {
      type: 'doc',
      content: [
        {
          type: 'heading',
          level: 1,
          content: [{ type: 'text', text: 'Title' }],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Bold', marks: { bold: true } },
            { type: 'text', text: ' and ' },
            { type: 'inlineMath', latex: 'x^2' },
          ],
        },
        {
          type: 'codeBlock',
          language: 'ts',
          content: [{ type: 'text', text: 'const x = 1;' }],
        },
        {
          type: 'displayMath',
          latex: '\\int_0^1 f(x)\\,dx',
        },
        {
          type: 'bulletList',
          content: [
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'bullet one' }] }] },
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'bullet two' }] }] },
          ],
        },
        {
          type: 'orderedList',
          content: [
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'first' }] }] },
          ],
        },
        {
          type: 'blockquote',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'quoted' }] }],
        },
        {
          type: 'image',
          src: 'https://example.com/x.png',
          alt: 'decorative',
        },
      ],
    };

    const text = extractText(doc);

    expect(text).toContain('Title');
    expect(text).toContain('Bold and $x^2$');
    expect(text).toContain('const x = 1;');
    expect(text).toContain('$$\\int_0^1 f(x)\\,dx$$');
    expect(text).toContain('bullet one');
    expect(text).toContain('bullet two');
    expect(text).toContain('first');
    expect(text).toContain('quoted');
  });

  it('ignores image blocks when extracting text', () => {
    const doc: NoteDoc = {
      type: 'doc',
      content: [{ type: 'image', src: 'https://example.com/x.png', alt: 'a' }],
    };
    expect(extractText(doc)).toBe('');
  });

  it('returns an empty string for an empty doc', () => {
    const doc: NoteDoc = { type: 'doc', content: [] };
    expect(extractText(doc)).toBe('');
  });
});
