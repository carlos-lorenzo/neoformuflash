/**
 * Tests for deriveTitle (lib/editor/derive-title.ts).
 */

import { describe, expect, it } from 'vitest';
import { deriveTitle, UNTITLED_TITLE } from './derive-title';

describe('lib/editor/derive-title — title derivation from NoteDoc', () => {
  it('returns paragraph text as title', () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Thermodynamics chapter 1' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'More content...' }] },
      ],
    };
    expect(deriveTitle(doc)).toBe('Thermodynamics chapter 1');
  });

  it('returns heading text as title', () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'heading', level: 1, content: [{ type: 'text', text: 'Week 3 — Electrostatics' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Body text...' }] },
      ],
    };
    expect(deriveTitle(doc)).toBe('Week 3 — Electrostatics');
  });

  it('prefers first non-empty block (skips empty paragraphs)', () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [] },
        { type: 'paragraph', content: [{ type: 'text', text: '  ' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'First real content' }] },
      ],
    };
    expect(deriveTitle(doc)).toBe('First real content');
  });

  it('handles heading levels 2 and 3', () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'heading', level: 2, content: [{ type: 'text', text: 'Section 2.1' }] },
        { type: 'heading', level: 3, content: [{ type: 'text', text: 'Subsection' }] },
      ],
    };
    expect(deriveTitle(doc)).toBe('Section 2.1');
  });

  it('returns UNTITLED_TITLE for empty doc', () => {
    const doc = { type: 'doc', content: [] };
    expect(deriveTitle(doc)).toBe(UNTITLED_TITLE);
  });

  it('returns UNTITLED_TITLE for doc with only empty blocks', () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [] },
        { type: 'heading', level: 1, content: [] },
      ],
    };
    expect(deriveTitle(doc)).toBe(UNTITLED_TITLE);
  });

  it('returns UNTITLED_TITLE for doc with only whitespace text', () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: '   \n\t  ' }] },
      ],
    };
    expect(deriveTitle(doc)).toBe(UNTITLED_TITLE);
  });

  it('handles inline marks (bold, italic, code, inlineMath)', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Chapter ' },
            { type: 'text', text: 'Bolt', marks: { bold: true } },
            { type: 'inlineMath', latex: 'x^2' },
            { type: 'text', text: ' end' },
          ],
        },
      ],
    };
    expect(deriveTitle(doc)).toBe('Chapter Boltx^2 end');
  });

  it('truncates long titles at 200 chars with ellipsis', () => {
    const longText = 'a'.repeat(250);
    const doc = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: longText }] },
      ],
    };
    const title = deriveTitle(doc);
    expect(title.length).toBe(201); // 200 + '…'
    expect(title.endsWith('…')).toBe(true);
  });

  it('handles nested content like list items', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'bulletList',
          content: [
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'First item' }] }] },
          ],
        },
      ],
    };
    expect(deriveTitle(doc)).toBe('First item');
  });
});