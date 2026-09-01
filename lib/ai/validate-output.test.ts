import { describe, it, expect } from 'vitest';
import { CopilotTextSchema, NoteDocSchema, validateWithRepair } from './validate-output';

/*
 * Regression: the copilot `generate` action returned `ai.invalidOutput` for
 * output that was structurally the doc we asked for. Every prompt describes the
 * target as "Tiptap-compatible JSON", so models emit the ProseMirror spelling
 * (marks as an array, latex/level under `attrs`, the `blockMath` node name).
 * NoteDocSchema now normalises that spelling before validating.
 */
describe('NoteDocSchema — ProseMirror-spelling normalization', () => {
  it('accepts PM-style marks arrays and converts them to the union object', () => {
    const r = NoteDocSchema.safeParse({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'x', marks: [{ type: 'bold' }, { type: 'italic' }] }],
        },
      ],
    });
    expect(r.success).toBe(true);
    if (r.success) {
      const para = r.data.content[0] as { content: Array<{ marks?: Record<string, boolean> }> };
      const firstInline = para.content[0];
      expect(firstInline).toBeDefined();
      expect(firstInline?.marks ?? {}).toEqual({ bold: true, italic: true });
    }
  });

  it('lifts latex out of attrs and accepts the blockMath node name', () => {
    const r = NoteDocSchema.safeParse({
      type: 'doc',
      content: [{ type: 'blockMath', attrs: { latex: 'E=mc^2' } }],
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.content[0]).toMatchObject({ type: 'displayMath', latex: 'E=mc^2' });
    }
  });

  it('lifts heading level out of attrs and clamps out-of-range levels', () => {
    const r = NoteDocSchema.safeParse({
      type: 'doc',
      content: [{ type: 'heading', attrs: { level: 7 }, content: [{ type: 'text', text: 'h' }] }],
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect((r.data.content[0] as { level: number }).level).toBe(3);
    }
  });

  it('wraps a bare block array in a doc', () => {
    const r = NoteDocSchema.safeParse([
      { type: 'paragraph', content: [{ type: 'text', text: 'hi' }] },
    ]);
    expect(r.success).toBe(true);
  });

  it('unwraps a doc the model nested under a noun from the prompt', () => {
    const r = NoteDocSchema.safeParse({
      noteDoc: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hi' }] }] },
    });
    expect(r.success).toBe(true);
  });

  it('carries a hardBreak node through as a newline instead of failing', () => {
    const r = NoteDocSchema.safeParse({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'a' }, { type: 'hardBreak' }] }],
    });
    expect(r.success).toBe(true);
  });
});

describe('NoteDocSchema — still rejects genuinely bad output', () => {
  for (const [name, value] of Object.entries<unknown>({
    'a plain string': 'hello',
    'a number': 42,
    'null': null,
    'an empty object': {},
    'an unknown node type': { type: 'doc', content: [{ type: 'iframe' }] },
    'a text node missing its text': { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text' }] }] },
    'a math node missing latex': { type: 'doc', content: [{ type: 'displayMath' }] },
    'content that is not an array': { type: 'doc', content: 'nope' },
  })) {
    it(`rejects ${name}`, () => {
      expect(NoteDocSchema.safeParse(value).success).toBe(false);
    });
  }
});

/*
 * Regression: the gate checked node *names* but not nesting, so a doc with a
 * misplaced node passed here and reached unionToProse, which had no arm for it
 * and emitted `undefined` into the editor. Rejecting these spends a repair turn
 * and gets a correctly-nested doc back instead of corrupting the document.
 */
describe('NoteDocSchema — rejects structurally misplaced nodes', () => {
  for (const [name, value] of Object.entries<unknown>({
    'a bulletList whose child is a paragraph': {
      type: 'doc',
      content: [{
        type: 'bulletList',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'x' }] }],
      }],
    },
    'an orderedList whose child is a text node': {
      type: 'doc',
      content: [{ type: 'orderedList', content: [{ type: 'text', text: 'x' }] }],
    },
    'a listItem holding a bare text node': {
      type: 'doc',
      content: [{
        type: 'bulletList',
        content: [{ type: 'listItem', content: [{ type: 'text', text: 'x' }] }],
      }],
    },
    'a top-level text node': {
      type: 'doc',
      content: [{ type: 'text', text: 'loose' }],
    },
    'a top-level inlineMath node': {
      type: 'doc',
      content: [{ type: 'inlineMath', latex: 'x^2' }],
    },
    'a top-level listItem': {
      type: 'doc',
      content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [] }] }],
    },
  })) {
    it(`rejects ${name}`, () => {
      expect(NoteDocSchema.safeParse(value).success).toBe(false);
    });
  }

  it('still accepts a correctly-nested list', () => {
    const r = NoteDocSchema.safeParse({
      type: 'doc',
      content: [{
        type: 'bulletList',
        content: [{
          type: 'listItem',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'x' }] }],
        }],
      }],
    });
    expect(r.success).toBe(true);
  });
});

/*
 * Regression: "when generating anything, the response is empty, when inserting
 * nothing appears". A model that refuses, or is truncated at the token limit,
 * emits a structurally valid but CONTENTLESS doc. Every refinement above passed
 * it, so the route returned ok, the preview rendered blank, and Insert pushed a
 * doc with no blocks into the editor. An empty doc is never a useful answer —
 * reject it so the repair loop asks again.
 */
describe('NoteDocSchema — rejects contentless output', () => {
  for (const [name, value] of Object.entries<unknown>({
    'a doc with no blocks at all': { type: 'doc', content: [] },
    'a doc of one empty paragraph': {
      type: 'doc',
      content: [{ type: 'paragraph', content: [] }],
    },
    'a doc of several empty paragraphs': {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [] },
        { type: 'paragraph', content: [] },
      ],
    },
    'a doc whose only text is the empty string': {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: '' }] }],
    },
    'a doc whose only text is whitespace': {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: '   \n  ' }] }],
    },
    'a doc whose only math has blank latex': {
      type: 'doc',
      content: [{ type: 'displayMath', latex: '  ' }],
    },
    'a list whose items are all empty': {
      type: 'doc',
      content: [{
        type: 'bulletList',
        content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [] }] }],
      }],
    },
  })) {
    it(`rejects ${name}`, () => {
      expect(NoteDocSchema.safeParse(value).success).toBe(false);
    });
  }

  it('still accepts a doc where only a nested node carries the content', () => {
    const r = NoteDocSchema.safeParse({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [] },
        {
          type: 'bulletList',
          content: [{
            type: 'listItem',
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'real' }] }],
          }],
        },
      ],
    });
    expect(r.success).toBe(true);
  });

  it('accepts a doc whose only content is a math node', () => {
    const r = NoteDocSchema.safeParse({
      type: 'doc',
      content: [{ type: 'displayMath', latex: 'E=mc^2' }],
    });
    expect(r.success).toBe(true);
  });
});

/*
 * Regression: the text actions ran validateWithRepair with NO schema, and every
 * provider extracts the answer as `(data as {text:string}).text`. A model that
 * named the field differently returned `undefined` — and JSON.stringify DROPS
 * an undefined value, so the client received `{result:{type:'text'}}` with no
 * `value` key at all: blank preview, and mdToNoteDoc(undefined) threw on Insert.
 */
describe('CopilotTextSchema', () => {
  it('accepts a normal answer', () => {
    expect(CopilotTextSchema.safeParse({ text: 'Newton says F=ma' }).success).toBe(true);
  });

  for (const [name, value] of Object.entries<unknown>({
    'a missing text field': { explanation: 'wrong key' },
    'an undefined text': { text: undefined },
    'a null text': { text: null },
    'a non-string text': { text: 42 },
    'an empty string': { text: '' },
    'a whitespace-only string': { text: '   \n ' },
  })) {
    it(`rejects ${name}`, () => {
      expect(CopilotTextSchema.safeParse(value).success).toBe(false);
    });
  }
});

describe('validateWithRepair', () => {
  it('passes the previous failure back to produce() on each repair attempt', async () => {
    const feedback: (string | null)[] = [];
    const res = await validateWithRepair(NoteDocSchema, async (fb) => {
      feedback.push(fb);
      return { not: 'a doc' };
    });
    expect(res.ok).toBe(false);
    // 1 initial (null) + 3 repairs (non-null feedback) = 4 total.
    expect(feedback[0]).toBeNull();
    expect(feedback.slice(1).every((f) => typeof f === 'string')).toBe(true);
    expect(feedback.length).toBe(4);
  });

  it('returns the parsed value once produce() yields a valid doc', async () => {
    const res = await validateWithRepair(NoteDocSchema, async () => ({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'ok' }] }],
    }));
    expect(res.ok).toBe(true);
  });
});
