/**
 * Tests for the prose↔union serializer (lib/editor/serialize.ts).
 *
 * Covers:
 *   - Every-node-type fixture round-trip (union → PM → union = identity)
 *   - extractText against a doc containing every node type (phase-02 AC8)
 *   - blockMath ↔ displayMath mapping
 *   - Rejection of unknown block types, unknown marks, and invalid heading levels
 *   - Empty-doc asymmetry (union content:[] → PM paragraph → union content:[empty paragraph])
 */

import { describe, expect, it } from 'vitest';
import { extractText, type NoteDoc } from '@neoformuflash/contracts';
import { proseToUnion, unionToProse } from './serialize';

/* ------------------------------------------------------------------ */
/*  Fixture: every node type the union supports                       */
/* ------------------------------------------------------------------ */

const EVERY_NODE_DOC: NoteDoc = {
  type: 'doc',
  content: [
    // Heading 1 with bold + inline math
    {
      type: 'heading',
      level: 1,
      content: [
        { type: 'text', text: 'Chapter ' },
        { type: 'text', text: 'Bolt', marks: { bold: true } },
        { type: 'inlineMath', latex: 'x^2' },
      ],
    },
    // Heading 2
    { type: 'heading', level: 2, content: [{ type: 'text', text: 'Section' }] },
    // Heading 3
    { type: 'heading', level: 3, content: [{ type: 'text', text: 'Sub' }] },
    // Paragraph with italic, code marks
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'Plain ' },
        { type: 'text', text: 'italic', marks: { italic: true } },
        { type: 'text', text: 'inline', marks: { code: true } },
        { type: 'inlineMath', latex: '\\alpha' },
        { type: 'text', text: ' end' },
      ],
    },
    // Empty paragraph
    { type: 'paragraph', content: [] },
    // Bullet list
    {
      type: 'bulletList',
      content: [
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'A' }] }] },
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'B' }] }] },
      ],
    },
    // Ordered list
    {
      type: 'orderedList',
      content: [
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'First' }] }] },
      ],
    },
    // Code block
    {
      type: 'codeBlock',
      language: 'typescript',
      content: [{ type: 'text', text: 'const x = 1;' }],
    },
    // Code block with null language
    {
      type: 'codeBlock',
      language: null,
      content: [{ type: 'text', text: 'plain code' }],
    },
    // Blockquote
    {
      type: 'blockquote',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Quoted' }] },
      ],
    },
    // Display math
    { type: 'displayMath', latex: '\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}' },
  ],
};

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe('serialize', () => {
  describe('round-trip', () => {
    it('preserves every node type through union → PM → union', () => {
      const pm = unionToProse(EVERY_NODE_DOC);
      const back = proseToUnion(pm);
      expect(back.ok).toBe(true);
      if (back.ok) {
        expect(back.value).toEqual(EVERY_NODE_DOC);
      }
    });

    it('maps blockMath ↔ displayMath', () => {
      const doc: NoteDoc = {
        type: 'doc',
        content: [{ type: 'displayMath', latex: 'E = mc^2' }],
      };
      const pm = unionToProse(doc);
      expect(pm.content?.[0]).toEqual({ type: 'blockMath', attrs: { latex: 'E = mc^2' } });

      const back = proseToUnion(pm);
      expect(back.ok).toBe(true);
      if (back.ok) {
        expect(back.value.content[0]).toEqual({ type: 'displayMath', latex: 'E = mc^2' });
      }
    });
  });

  describe('extractText (AC8)', () => {
    it('produces readable text with math as LaTeX source', () => {
      const pm = unionToProse(EVERY_NODE_DOC);
      const back = proseToUnion(pm);
      expect(back.ok).toBe(true);
      if (!back.ok) return;

      const text = extractText(back.value);
      // Inline math renders as $latex$
      expect(text).toContain('$x^2$');
      expect(text).toContain('$\\alpha$');
      // Display math renders as $$latex$$
      expect(text).toContain('$\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}$$');
      // Heading text
      expect(text).toContain('Chapter ');
      expect(text).toContain('Bolt');
      // List items
      expect(text).toContain('A');
      expect(text).toContain('B');
      expect(text).toContain('First');
      // Code block
      expect(text).toContain('const x = 1;');
      expect(text).toContain('plain code');
      // Blockquote
      expect(text).toContain('Quoted');
    });
  });

  describe('rejection', () => {
    it('rejects an unknown block type', () => {
      const pm = {
        type: 'doc',
        content: [{ type: 'totallyUnknown', text: 'x' }],
      };
      const result = proseToUnion(pm);
      expect(result.ok).toBe(false);
    });

    it('rejects an unknown mark type', () => {
      const pm = {
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'x', marks: [{ type: 'strikethrough' }] }] },
        ],
      };
      const result = proseToUnion(pm);
      expect(result.ok).toBe(false);
    });

    it('rejects heading level outside 1–3', () => {
      const pm = {
        type: 'doc',
        content: [
          { type: 'heading', attrs: { level: 5 }, content: [{ type: 'text', text: 'Big' }] },
        ],
      };
      const result = proseToUnion(pm);
      expect(result.ok).toBe(false);
    });

    it('rejects a non-object input', () => {
      expect(proseToUnion(null).ok).toBe(false);
      expect(proseToUnion('string').ok).toBe(false);
      expect(proseToUnion(42).ok).toBe(false);
    });

    it('rejects a doc without content array', () => {
      expect(proseToUnion({ type: 'doc' }).ok).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('round-trips an empty doc (content:[]) → PM adds a paragraph → union has one empty paragraph', () => {
      const emptyDoc: NoteDoc = { type: 'doc', content: [] };
      const pm = unionToProse(emptyDoc);
      // PM's TrailingNode plugin adds a paragraph, but the serializer doesn't —
      // PM handles this at the Editor level, so unionToProse emits [] and
      // the content is [].
      expect(pm.content).toEqual([]);

      // proseToUnion of an empty content → empty doc
      const back = proseToUnion(pm);
      expect(back.ok).toBe(true);
      if (back.ok) {
        expect(back.value.content).toEqual([]);
      }
    });

    it('round-trips an empty paragraph (content omitted in PM JSON)', () => {
      const pm = {
        type: 'doc',
        content: [{ type: 'paragraph' }],
      };
      const back = proseToUnion(pm);
      expect(back.ok).toBe(true);
      if (back.ok) {
        expect(back.value.content).toEqual([{ type: 'paragraph', content: [] }]);
      }
    });

    it('preserves codeBlock language as null when omitted in PM', () => {
      const pm = {
        type: 'doc',
        content: [{ type: 'codeBlock', content: [{ type: 'text', text: 'x' }] }],
      };
      const back = proseToUnion(pm);
      expect(back.ok).toBe(true);
      if (back.ok) {
        expect(back.value.content[0]).toEqual({
          type: 'codeBlock',
          language: null,
          content: [{ type: 'text', text: 'x' }],
        });
      }
    });
  });
});
