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
  ];
}

/** The KaTeX options used by the extensions — exported for tests. */
export { KATEX_OPTIONS };
