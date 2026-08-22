/**
 * Tests for the markdown-lite → NoteDoc parser (lib/editor/md-to-note-doc.ts).
 *
 * The load-bearing guarantee is the round-trip block at the bottom: every
 * parser output must survive `unionToProse` → `proseToUnion` without a
 * validation error, because that is exactly the path AI text takes on insert
 * and then on the next save (phase-05 AC6).
 */

import { describe, expect, it } from 'vitest';
import type { BlockNode, NoteDoc } from '@neoformuflash/contracts';
import { mdToNoteDoc } from './md-to-note-doc';
import { proseToUnion, unionToProse } from './serialize';

describe('mdToNoteDoc — inline math', () => {
  it('parses $…$ into an inlineMath node', () => {
    const doc = mdToNoteDoc('The value $x^2$ is positive.');
    expect(doc.content).toEqual([
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'The value ' },
          { type: 'inlineMath', latex: 'x^2' },
          { type: 'text', text: ' is positive.' },
        ],
      },
    ]);
  });

  it('does not treat currency $5 / $10 as math', () => {
    const doc = mdToNoteDoc('it costs $5 and $10');
    expect(doc.content).toEqual([
      { type: 'paragraph', content: [{ type: 'text', text: 'it costs $5 and $10' }] },
    ]);
  });

  it('keeps an unterminated $ as literal text', () => {
    const doc = mdToNoteDoc('cost is $5 today');
    const para = doc.content[0] as Extract<BlockNode, { type: 'paragraph' }>;
    expect(para.content).toEqual([{ type: 'text', text: 'cost is $5 today' }]);
  });

  it('honours an escaped \\$', () => {
    const doc = mdToNoteDoc('price \\$5 and $x$');
    const para = doc.content[0] as Extract<BlockNode, { type: 'paragraph' }>;
    expect(para.content).toEqual([
      { type: 'text', text: 'price $5 and ' },
      { type: 'inlineMath', latex: 'x' },
    ]);
  });
});

describe('mdToNoteDoc — display math', () => {
  it('parses $$…$$ alone on a line as displayMath', () => {
    const doc = mdToNoteDoc('$$\\frac{a}{b}$$');
    expect(doc.content).toEqual([{ type: 'displayMath', latex: '\\frac{a}{b}' }]);
  });

  it('parses a multi-line $$ … $$ block', () => {
    const doc = mdToNoteDoc('$$\nE = mc^2\n$$');
    expect(doc.content).toEqual([{ type: 'displayMath', latex: 'E = mc^2' }]);
  });

  it('degrades inline $$…$$ mixed with prose to inlineMath', () => {
    const doc = mdToNoteDoc('see $$x^2$$ here');
    const para = doc.content[0] as Extract<BlockNode, { type: 'paragraph' }>;
    expect(para.content).toEqual([
      { type: 'text', text: 'see ' },
      { type: 'inlineMath', latex: 'x^2' },
      { type: 'text', text: ' here' },
    ]);
  });

  it('drops an empty $$ $$', () => {
    const doc = mdToNoteDoc('$$$$');
    expect(doc.content).toEqual([]);
  });
});

describe('mdToNoteDoc — blocks', () => {
  it('parses headings at levels 1–3', () => {
    const doc = mdToNoteDoc('# One\n## Two\n### Three');
    expect(doc.content).toEqual([
      { type: 'heading', level: 1, content: [{ type: 'text', text: 'One' }] },
      { type: 'heading', level: 2, content: [{ type: 'text', text: 'Two' }] },
      { type: 'heading', level: 3, content: [{ type: 'text', text: 'Three' }] },
    ]);
  });

  it('clamps deeper headings to level 3', () => {
    const doc = mdToNoteDoc('##### Deep');
    expect(doc.content).toEqual([
      { type: 'heading', level: 3, content: [{ type: 'text', text: 'Deep' }] },
    ]);
  });

  it('parses a bullet list', () => {
    const doc = mdToNoteDoc('- a\n- b');
    expect(doc.content).toEqual([
      {
        type: 'bulletList',
        content: [
          { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'a' }] }] },
          { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'b' }] }] },
        ],
      },
    ]);
  });

  it('parses an ordered list', () => {
    const doc = mdToNoteDoc('1. first\n2. second');
    expect(doc.content).toEqual([
      {
        type: 'orderedList',
        content: [
          { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'first' }] }] },
          { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'second' }] }] },
        ],
      },
    ]);
  });

  it('parses a fenced code block with a language', () => {
    const doc = mdToNoteDoc('```python\nprint(1)\n```');
    expect(doc.content).toEqual([
      { type: 'codeBlock', language: 'python', content: [{ type: 'text', text: 'print(1)' }] },
    ]);
  });

  it('parses a fenced code block without a language', () => {
    const doc = mdToNoteDoc('```\nx = 1\n```');
    expect(doc.content).toEqual([
      { type: 'codeBlock', language: null, content: [{ type: 'text', text: 'x = 1' }] },
    ]);
  });

  it('parses a blockquote', () => {
    const doc = mdToNoteDoc('> quoted line');
    expect(doc.content).toEqual([
      {
        type: 'blockquote',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'quoted line' }] }],
      },
    ]);
  });

  it('splits paragraphs on blank lines', () => {
    const doc = mdToNoteDoc('one\n\ntwo');
    expect(doc.content).toEqual([
      { type: 'paragraph', content: [{ type: 'text', text: 'one' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'two' }] },
    ]);
  });
});

describe('mdToNoteDoc — inline marks', () => {
  it('parses bold, italic and code', () => {
    const doc = mdToNoteDoc('a **b** c *d* e `f`');
    const para = doc.content[0] as Extract<BlockNode, { type: 'paragraph' }>;
    expect(para.content).toEqual([
      { type: 'text', text: 'a ' },
      { type: 'text', text: 'b', marks: { bold: true } },
      { type: 'text', text: ' c ' },
      { type: 'text', text: 'd', marks: { italic: true } },
      { type: 'text', text: ' e ' },
      { type: 'text', text: 'f', marks: { code: true } },
    ]);
  });

  it('does not treat $ inside a code span as math', () => {
    const doc = mdToNoteDoc('run `echo $HOME`');
    const para = doc.content[0] as Extract<BlockNode, { type: 'paragraph' }>;
    expect(para.content).toEqual([
      { type: 'text', text: 'run ' },
      { type: 'text', text: 'echo $HOME', marks: { code: true } },
    ]);
  });
});

describe('mdToNoteDoc — edge cases', () => {
  it('returns an empty doc for empty input', () => {
    expect(mdToNoteDoc('')).toEqual({ type: 'doc', content: [] });
  });

  it('returns an empty doc for whitespace-only input', () => {
    expect(mdToNoteDoc('   \n\n  ')).toEqual({ type: 'doc', content: [] });
  });

  it('normalizes CRLF line endings', () => {
    const doc = mdToNoteDoc('# Title\r\n\r\nbody');
    expect(doc.content).toEqual([
      { type: 'heading', level: 1, content: [{ type: 'text', text: 'Title' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'body' }] },
    ]);
  });
});

describe('mdToNoteDoc — round-trips through the serializer (AC6)', () => {
  const fixtures: Array<[string, string]> = [
    ['inline math', 'The formula $a^2 + b^2 = c^2$ holds.'],
    ['display math', '$$\\int_0^1 x\\,dx = \\tfrac{1}{2}$$'],
    ['heading + list + math', '# Title\n\n- item $x$\n- item $y$\n\n$$z = 1$$'],
    ['code block', '```ts\nconst x = 1;\n```'],
    ['blockquote', '> a wise $\\pi$ quote'],
    ['marks', 'a **bold** and *italic* and `code` run'],
    ['mixed doc', '## Heading\n\nProse with $e^{i\\pi}$ inline.\n\n1. one\n2. two'],
  ];

  it.each(fixtures)('round-trips: %s', (_label, input) => {
    const doc: NoteDoc = mdToNoteDoc(input);
    const prose = unionToProse(doc);
    const back = proseToUnion(prose);
    expect(back.ok).toBe(true);
  });
});
