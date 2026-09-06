/**
 * Shared math-aware editor field.
 *
 * This component replaces the duplicated Tiptap editor setup in:
 *   - card-editor.tsx (front + back editors)
 *   - inline-edit-overlay.tsx (front + back editors)
 *   - multi-card-editor.tsx (2 per card, one row live at a time)
 *   - (future) note-editor.tsx (adopts buildEditorExtensions only)
 *
 * It owns:
 *   - useEditor with shared extensions
 *   - EditorContent rendering
 *   - The $ / ⌘M / ⌘⇧M keyboard machine (per-field, via handleKeyDown)
 *   - MathInput panel mount
 *   - katex-client side effect
 *
 * The TRAP: note-editor.tsx holds module-level singletons (editorHandle,
 * mathOpener). That works only because exactly one NoteEditor ever mounts.
 * MathEditorField mounts TWICE simultaneously in the legacy card editor
 * (front + back), and the multi-card deck editor puts 2xN of them on one page —
 * clicking a formula in the front would open the panel over the back.
 * MUST use per-instance refs. This field exposes an imperative handle
 * (getDoc / isFocused / openInlineMath / openDisplayMath) so a parent can route
 * save and global shortcuts to the focused field. Highest-probability
 * regression in the phase, and it presents as something easy to dismiss as
 * cosmetic.
 */

'use client';

import { forwardRef, useCallback, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useEditor, EditorContent } from '@tiptap/react';
import type { Editor } from '@tiptap/core';
import { buildEditorExtensions } from '@/lib/editor/tiptap-extensions';
import { findMathAtClick } from '@/lib/editor/math-click';
import { MathInput } from '@/components/editor/math-input';
import { unionToProse, proseToUnion } from '@/lib/editor/serialize';
import type { NoteDoc } from '@neoformuflash/contracts';
import { useShortcut } from '@/lib/shortcuts/use-shortcut';
import './katex-client';

export type MathEditorFieldHandle = {
  /** Latest document, read directly from the ProseMirror instance (bypasses the
   *  debounced onChange — used on save). */
  getDoc: () => NoteDoc;
  /** Whether this field's editor currently owns focus. */
  isFocused: () => boolean;
  openInlineMath: () => void;
  openDisplayMath: () => void;
  /** Move focus here. Used by the multi-card editor's Tab chain. */
  focus: (pos?: 'start' | 'end') => void;
  /** True when the document has no content — an untouched card row. */
  isEmpty: () => boolean;
  /**
   * True while this field's MathInput panel is open.
   *
   * The shortcut provider listens on `window` with capture:true, so a parent's
   * `allowInEditable` Escape binding fires BEFORE MathInput's own Escape
   * handler and preventDefault does not stop it. A parent must consult this
   * and bail, or Escape inside an open equation cancels the panel AND whatever
   * the parent's Escape does.
   */
  hasOpenMathPanel: () => boolean;
};

type MathEditorFieldProps = {
  /** Initial content (NoteDoc from the server) */
  content: NoteDoc;
  /** Called when content changes (debounced/batched by caller) */
  onChange: (doc: NoteDoc) => void;
  /** Placeholder text for empty editor */
  placeholder: string;
  /** Standalone mode only: register a global ⌘M / ⌘⇧M on this field. Omit in
   *  pair mode (card editor / inline edit) — there the parent registers one
   *  binding and routes to the focused field via the imperative handle, because
   *  the shortcut dispatcher fires only the last-registered match. */
  shortcutScope?: 'editor' | 'review' | 'global';
  /** Forwarded so a parent can inspect content / route shortcuts on save. */
  ref?: React.Ref<MathEditorFieldHandle>;
  /** Focus this field as soon as its view exists. */
  autoFocus?: boolean;
  /** Where autoFocus lands. Tabbing forward wants 'start', backward 'end'. */
  autoFocusPos?: 'start' | 'end';
  /**
   * Tab / Shift+Tab pressed inside this field. Return true to consume it.
   *
   * Handled here at the ProseMirror level rather than through useShortcut for
   * three reasons: a global Tab binding would need `allowInEditable` and would
   * then fire for every Tab on the page, destroying ordinary focus traversal;
   * the semantics are "tab out of THIS field", which is exactly what a
   * per-field handler scopes; and Shift+Tab out of the first field must FALL
   * THROUGH to the browser, which returning false does for free.
   *
   * Omitting this prop leaves Tab entirely untouched — that is what keeps
   * inline-edit-overlay.tsx and the legacy card editor behaving as before.
   */
  onTabOut?: (direction: 'forward' | 'backward') => boolean;
  onFocus?: () => void;
  onBlur?: () => void;
};

/**
 * Per-instance math panel state — avoids the module-singleton trap.
 */
type MathPanel = {
  mode: 'inline' | 'display';
  initial: string;
  editPos?: number;
  position: { top: number; left: number };
};

const EMPTY_DOC: NoteDoc = { type: 'doc', content: [] };

function isAtStartOfEmptyBlock(ed: Editor): boolean {
  const { $from } = ed.state.selection;
  return $from.parentOffset === 0 && $from.parent.content.size === 0;
}

/**
 * MathEditorField — a single Tiptap editor with math support.
 *
 * Keyboard (all handled per-field at the ProseMirror level, matching
 * note-editor's machine):
 *   - $ (start of empty block) → inline math, with a $$→display preamble
 *   - ⌘M / Ctrl+M       → inline math (anywhere in the editor)
 *   - ⌘⇧M / Ctrl+Shift+M → display math
 */
export const MathEditorField = forwardRef<MathEditorFieldHandle, MathEditorFieldProps>(
  function MathEditorField(
    {
      content,
      onChange,
      placeholder,
      shortcutScope,
      autoFocus = false,
      autoFocusPos = 'end',
      onTabOut,
      onFocus,
      onBlur,
    },
    ref
  ) {
    const [mathPanel, setMathPanel] = useState<MathPanel | null>(null);
    /*
     * Mirrors mathPanel so hasOpenMathPanel() can read it without putting
     * mathPanel in the imperative handle's deps — which would hand the parent
     * a new handle object every time an equation panel opened.
     */
    const mathPanelRef = useRef<MathPanel | null>(null);
    mathPanelRef.current = mathPanel;
    const editorRef = useRef<Editor | null>(null);
    const pendingChangeRef = useRef<NoteDoc | null>(null);
    const flushTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const pendingDollarRef = useRef(false);
    /*
     * handleKeyDown is captured once when the editor is created, so reading
     * onTabOut through a ref is what keeps a re-rendered parent's newer
     * callback reachable. Putting it in the deps of useEditor instead would
     * tear down and rebuild the ProseMirror view on every parent render.
     */
    const onTabOutRef = useRef(onTabOut);
    onTabOutRef.current = onTabOut;

    /*
     * Math panel openers — declared before useEditor so the handleKeyDown
     * closure always reads an initialised binding. Each field has its own
     * opener (per-instance, no module singletons).
     */
    const openInlineMath = useCallback((initial = '') => {
      const ed = editorRef.current;
      if (!ed) return;
      const coords = ed.view.coordsAtPos(ed.state.selection.from);
      setMathPanel({ mode: 'inline', initial, position: { top: coords.bottom, left: coords.left } });
    }, []);

    const openDisplayMath = useCallback(() => {
      const ed = editorRef.current;
      if (!ed) return;
      const coords = ed.view.coordsAtPos(ed.state.selection.from);
      setMathPanel({ mode: 'display', initial: '', position: { top: coords.bottom, left: coords.left } });
    }, []);

    /*
     * Build extensions using the shared config. The placeholder is the only
     * variable parameter — everything else is security-hardened.
     */
    const extensions = useMemo(
      () => buildEditorExtensions(placeholder),
      [placeholder]
    );

    const editor = useEditor({
      extensions,
      content: unionToProse(content) ?? undefined,
      immediatelyRender: false,
      editorProps: {
        attributes: { class: 'w-full min-h-0' },
        // Clicking a rendered math node opens its edit panel (see
        // lib/editor/math-click.ts). An event handler, so ref reads are fine.
        handleClick: (view, pos, event) => {
          const hit = findMathAtClick(view, pos, event.target);
          if (!hit) return false;
          const coords = view.coordsAtPos(hit.pos);
          setMathPanel({
            mode: hit.mode,
            initial: hit.node.attrs.latex as string,
            editPos: hit.pos,
            position: { top: coords.bottom, left: coords.left },
          });
          return true;
        },
        handleKeyDown: (_view: unknown, event: KeyboardEvent): boolean => {
          const ed = editorRef.current;
          if (!ed) return false;

          /*
           * Tab — only when a parent asked for it. Placed before every other
           * branch so the multi-card editor's traversal is not shadowed, and
           * ahead of StarterKit's list-item Tab keymap (direct view props are
           * consulted before plugin keymaps). Consequence, accepted
           * deliberately: inside a bullet list in a card field, Tab leaves the
           * field rather than indenting the item.
           */
          if (event.key === 'Tab' && onTabOutRef.current) {
            const handled = onTabOutRef.current(event.shiftKey ? 'backward' : 'forward');
            if (!handled) return false;
            event.preventDefault();
            return true;
          }

          // ⌘M / ⌘⇧M — inline / display math.
          if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'm') {
            event.preventDefault();
            if (event.shiftKey) openDisplayMath();
            else openInlineMath();
            return true;
          }

          // `$` — progressive disclosure (AC3/AC4). On an empty block the
          // first `$` arms a pending flag so `$$` reads as display equation.
          if (event.key === '$') {
            event.preventDefault();
            if (pendingDollarRef.current && isAtStartOfEmptyBlock(ed)) {
              pendingDollarRef.current = false;
              openDisplayMath();
            } else if (isAtStartOfEmptyBlock(ed)) {
              pendingDollarRef.current = true;
              setTimeout(() => {
                if (pendingDollarRef.current) openInlineMath();
                pendingDollarRef.current = false;
              }, 150);
            }
            return true;
          }

          return false;
        },
      },
      autofocus: autoFocus ? autoFocusPos : false,
      onFocus: () => onFocus?.(),
      onBlur: () => onBlur?.(),
      onUpdate: ({ editor }) => {
        const union = proseToUnion(editor.getJSON());
        if (union.ok) {
          pendingChangeRef.current = union.value;
          // Debounce: batch changes during continuous typing
          if (flushTimeoutRef.current) clearTimeout(flushTimeoutRef.current);
          flushTimeoutRef.current = setTimeout(() => {
            if (pendingChangeRef.current) {
              onChange(pendingChangeRef.current);
              pendingChangeRef.current = null;
            }
          }, 150);
        }
      },
      onCreate: ({ editor }) => {
        editorRef.current = editor;
      },
      onDestroy: () => {
        editorRef.current = null;
      },
    });

    /*
     * Imperative handle: lets a parent (card editor / inline-edit overlay)
     * read the current doc synchronously on save, and route global ⌘M/⌘⇧M to
     * whichever field has focus in pair mode.
     */
    useImperativeHandle(ref, () => ({
      getDoc: () => {
        const ed = editorRef.current;
        if (!ed) return pendingChangeRef.current ?? EMPTY_DOC;
        const union = proseToUnion(ed.getJSON());
        return union.ok ? union.value : pendingChangeRef.current ?? EMPTY_DOC;
      },
      isFocused: () => editorRef.current?.view.hasFocus() ?? false,
      openInlineMath,
      openDisplayMath,
      focus: (pos = 'end') => {
        editorRef.current?.chain().focus(pos).run();
      },
      isEmpty: () => editorRef.current?.isEmpty ?? true,
      hasOpenMathPanel: () => mathPanelRef.current !== null,
    }), [openInlineMath, openDisplayMath]);

    /*
     * Standalone-mode global bindings (⌘M / ⌘⇧M). In pair mode the parent
     * registers these once and routes to the focused field — two fields both
     * registering ⌘M would let the dispatcher fire only the last-registered
     * match (provider's first-match-wins loop).
     */
    useShortcut(shortcutScope as 'editor' | 'review' | 'global', 'mod+m', openInlineMath, {
      label: 'shortcuts.editor.inlineMath',
      disabled: shortcutScope === undefined,
    });
    useShortcut(shortcutScope as 'editor' | 'review' | 'global', 'mod+shift+m', openDisplayMath, {
      label: 'shortcuts.editor.displayMath',
      disabled: shortcutScope === undefined,
    });

    /*
     * MathInput panel — portalled to avoid z-index issues with flip cards.
     */
    const commitMath = useCallback((latex: string) => {
      const ed = editorRef.current;
      if (!ed) return;
      if (mathPanel?.editPos !== undefined) {
        const update = mathPanel.mode === 'inline'
          ? ed.chain().focus().updateInlineMath({ latex, pos: mathPanel.editPos })
          : ed.chain().focus().updateBlockMath({ latex, pos: mathPanel.editPos });
        update.run();
      } else if (mathPanel?.mode === 'inline') {
        ed.chain().focus().insertInlineMath({ latex }).run();
      } else {
        ed.chain().focus().insertBlockMath({ latex }).run();
      }
      setMathPanel(null);
    }, [mathPanel]);

    const cancelMath = useCallback(() => {
      setMathPanel(null);
    }, []);

    return (
      <>
        <div className="prose prose-sm max-w-none">
          <EditorContent editor={editor} />
        </div>
        {mathPanel && typeof document !== 'undefined' && (
          createPortal(
            <MathInput
              mode={mathPanel.mode}
              initialLatex={mathPanel.initial}
              position={mathPanel.position}
              onCommit={commitMath}
              onCancel={cancelMath}
            />,
            document.body
          )
        )}
      </>
    );
  },
);
