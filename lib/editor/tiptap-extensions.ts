/**
 * Shared Tiptap extension configuration.
 *
 * This is the actual 4-way duplicate:
 *   - note-editor.tsx:33-41
 *   - card-editor.tsx:30-54
 *   - inline-edit-overlay.tsx:19-36
 *   - (would-be) math-editor-field.tsx
 *
 * As a React-free .ts it lands in the existing lib test glob for free,
 * making the security properties unit-testable for the first time:
 *   - trust: false (the XSS control EVOLUTION names Tiptap as the vector for)
 *   - addInputRules returns [] (the $$...$$ bypass)
 * are currently asserted by three identical code comments and nothing else.
 */

import { Node, mergeAttributes, InputRule } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { InlineMath, BlockMath } from '@tiptap/extension-mathematics';

/**
 * KaTeX runs with trust off so \href / \includegraphics cannot smuggle markup
 * (specs/EVOLUTION.md names Tiptap as the anticipated XSS vector).
 */
const KATEX_OPTIONS = { throwOnError: false, trust: false, strict: false } as const;

/*
 * The extension's input rules convert literal `$$...$$` text into math nodes —
 * that would bypass the MathInput's validation. The $ state machine owns the
 * trigger, so the rules are disabled here.
 */
const InlineMathNoRules = InlineMath.extend({ addInputRules() { return []; } });
const BlockMathNoRules = BlockMath.extend({ addInputRules() { return []; } });

/* ------------------------------------------------------------------ */
/*  Image                                                              */
/* ------------------------------------------------------------------ */

/**
 * A remote image block. Only http(s) sources are accepted — the input rule and
 * the proseToUnion trust boundary both reject every other scheme, so a
 * javascript:/data: src can never reach a document or an <img> renderer.
 *
 * The markdown `![alt](url)` (or `![](url)`) shorthand converts while typing
 * (or on paste) via the input rule below, matching how the other StarterKit
 * markdown shortcuts behave.
 */
const IMAGE_SRC_RE = /^https?:\/\//i;

const NoteImage = Node.create({
  name: 'image',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      src: { default: '' },
      alt: { default: '' },
    };
  },

  parseHTML() {
    return [{ tag: 'img[src]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['img', mergeAttributes(HTMLAttributes, { class: 'note-image' })];
  },

  addInputRules() {
    const type = this.type;
    return [
      new InputRule({
        find: /!\[([^\]]*)\]\((\S+)\)$/i,
        handler: ({ state, range, match }) => {
          const src = match[2] ?? '';
          const alt = match[1] ?? '';
          if (!IMAGE_SRC_RE.test(src)) return;

          // The matched markdown occupies [range.from, range.to) in the doc; the
          // characters of the just-typed tail are not in the doc yet and are
          // dropped when this transaction dispatches.
          const start = range.from;
          const end = range.to;
          const node = type.create({ src, alt });
          const $s = state.doc.resolve(start);

          // Text that sits before/after the markdown on the same textblock.
          const parentText = $s.parent.textContent;
          const beforeText = parentText.slice(0, $s.parentOffset);
          const afterText = parentText.slice($s.parentOffset + (end - start));

          if (!beforeText.trim() && !afterText.trim()) {
            // The markdown is the whole block — swap the block for the image.
            state.tr.replaceWith($s.before(), $s.after(), node);
          } else if (beforeText.trim() && !afterText.trim()) {
            // Trailing image: delete the markdown, append the image after the block.
            state.tr.delete(start, end);
            state.tr.insert(state.tr.mapping.map($s.after()), node);
          } else if (!beforeText.trim() && afterText.trim()) {
            // Leading image: delete the markdown, prepend the image before the block.
            state.tr.delete(start, end);
            state.tr.insert(state.tr.mapping.map($s.before()), node);
          } else {
            // Mid-line: delete the markdown, split the block at the caret and
            // drop the image between the two halves (text before stays put).
            state.tr.delete(start, end);
            const pos = state.tr.mapping.map(start);
            state.tr.split(pos);
            state.tr.insert(pos, node);
          }
        },
      }),
    ];
  },
});

/**
 * Build the Tiptap extensions array for a given placeholder.
 *
 * @param placeholder — the placeholder text for empty editor state
 * @returns Tiptap extension array (StarterKit + Placeholder + math with disabled input rules)
 */
export function buildEditorExtensions(placeholder: string) {
  return [
    Placeholder.configure({ placeholder }),
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      hardBreak: false,
      horizontalRule: false,
      link: false,
      strike: false,
      underline: false,
    }),
    InlineMathNoRules.configure({ katexOptions: { ...KATEX_OPTIONS } }),
    BlockMathNoRules.configure({ katexOptions: { ...KATEX_OPTIONS } }),
    NoteImage,
  ];
}

/** The KaTeX options used by the extensions — exported for tests. */
export { KATEX_OPTIONS };
