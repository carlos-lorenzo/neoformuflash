// Client: the composite editor. Owns the Tiptap instance, title, autosave
// lifecycle (debounced, retried, offline-aware), the `$` / `/` / ⌘M / ⌘⇧M
// keyboard flows, the floating panels, and the 390px read-only gate.
//
// Server component renders the shell; Tiptap mounts client-side
// (immediatelyRender: false) so there is no hydration mismatch.

'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useTranslations } from 'next-intl';
import { useEditor, EditorContent } from '@tiptap/react';
import type { Editor } from '@tiptap/core';
import type { Node } from '@tiptap/pm/model';
import StarterKit from '@tiptap/starter-kit';
import { InlineMath, BlockMath } from '@tiptap/extension-mathematics';
import Placeholder from '@tiptap/extension-placeholder';
import { unionToProse } from '@/lib/editor/serialize';
import { saveNote } from '@/app/app/notes/actions';
import { useActiveScope } from '@/lib/shortcuts/use-scope';
import { useShortcut } from '@/lib/shortcuts/use-shortcut';
import type { NoteRow } from '@/lib/db/notes';
import { SaveIndicator, type SaveStatus } from './save-indicator';
import { NoteTitleInput } from './note-title-input';
import { MathInput } from './math-input';
import { SlashMenu } from './slash-menu';
import './katex-client';

/*
 * KaTeX runs with trust off so \href / \includegraphics cannot smuggle markup
 * (specs/EVOLUTION.md names Tiptap as the anticipated XSS vector).
 */
const KATEX_OPTIONS = { throwOnError: false, trust: false, strict: false } as const;

/*
 * The extension's input rules convert literal `$$…$$` text into math nodes —
 * that would bypass the MathInput's validation. The `$` state machine below
 * owns the trigger, so the rules are disabled here.
 */
const InlineMathNoRules = InlineMath.extend({ addInputRules() { return []; } });
const BlockMathNoRules = BlockMath.extend({ addInputRules() { return []; } });

const AUTOSAVE_MS = 800;

type PanelPosition = { top: number; left: number };

type MathPanel = {
  mode: 'inline' | 'display';
  initial: string;
  /** Non-null when editing an existing math node (clicked into edit). */
  editPos?: number;
  position: PanelPosition;
};

type OutlineItem = { level: number; text: string; pos: number };

/* ------------------------------------------------------------------ */
/*  Tablet gate (≥768px the editor is usable; design-system §6)        */
/* ------------------------------------------------------------------ */

function subscribeTablet(onChange: () => void): () => void {
  const mq = window.matchMedia('(min-width: 768px)');
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
}

function getTabletSnapshot(): boolean {
  return window.matchMedia('(min-width: 768px)').matches;
}

function useIsTablet(): boolean {
  return useSyncExternalStore(subscribeTablet, getTabletSnapshot, () => false);
}

/* ------------------------------------------------------------------ */
/*  Tiptap runs outside React — the math extensions' onClick needs the */
/*  editor at click time, but a React ref can't be read inside the     */
/*  render-created extension closure (react-hooks/refs). These module  */
/*  handles are synced by effects and read only at event time.         */
/* ------------------------------------------------------------------ */

type MathOpener = (mode: 'inline' | 'display', pos: number, latex: string, position: PanelPosition) => void;

let editorHandle: Editor | null = null;
let mathOpener: MathOpener = () => {};

function mathOnClick(mode: 'inline' | 'display'): (node: Node, pos: number) => void {
  return (node, pos) => {
    const ed = editorHandle;
    if (!ed) return;
    const coords = ed.view.coordsAtPos(pos);
    mathOpener(mode, pos, node.attrs.latex as string, { top: coords.bottom, left: coords.left });
  };
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function NoteEditor({ note }: { note: NoteRow }) {
  const t = useTranslations('editor');
  const isTablet = useIsTablet();
  useActiveScope('editor');

  const [title, setTitle] = useState(note.title);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [mathPanel, setMathPanel] = useState<MathPanel | null>(null);
  const [slashOpen, setSlashOpen] = useState(false);
  const [slashPosition, setSlashPosition] = useState<PanelPosition>({ top: 0, left: 0 });
  const [outline, setOutline] = useState<OutlineItem[]>([]);

  const editorRef = useRef<Editor | null>(null);
  const titleRef = useRef(title);
  const dirtyRef = useRef(false);
  const retriedRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingDollarRef = useRef(false);

  /* ---------------- sync module handle for math clicks ---------------- */

  useEffect(() => {
    mathOpener = (mode, pos, latex, position) => {
      setMathPanel({ mode, initial: latex, editPos: pos, position });
    };
  }, []);

  /* ---------------- autosave ---------------- */

  const persist = useCallback(async () => {
    const ed = editorRef.current;
    if (!ed) return;
    setSaveStatus('saving');
    /*
     * ed.getJSON() can carry ProseMirror-internal attrs on math nodes that
     * Next.js serializes as client references — a server action then throws
     * "cannot dot into a temporary client reference". Round-tripping through
     * JSON produces plain serializable data (AC8 depends on this).
     */
    const contentJson = JSON.parse(JSON.stringify(ed.getJSON())) as Record<string, unknown>;
    const args = { id: note.id, title: titleRef.current, contentJson };

    /*
     * saveNote can reject (network abort / fetch failure) as well as return
     * {errors} from the server. Both must land in the same retry/error path
     * so the status never stays stuck at 'saving'.
     */
    const doSave = async () => {
      try { return await saveNote(args); } catch { return { errors: { form: 'error.network' } } as const; }
    };

    let result = await doSave();
    // One immediate retry, then surface the error with a manual retry (AC6).
    if (result.errors && !retriedRef.current) {
      retriedRef.current = true;
      result = await doSave();
    }
    if (result.errors) {
      retriedRef.current = false;
      dirtyRef.current = true;
      setSaveStatus('error');
      return;
    }
    retriedRef.current = false;
    dirtyRef.current = false;
    setSaveStatus('saved');
  }, [note.id]);

  const scheduleSave = useCallback(() => {
    dirtyRef.current = true;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setSaveStatus('offline');
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void persist();
    }, AUTOSAVE_MS);
  }, [persist]);

  // Offline → online: flush whatever was buffered.
  useEffect(() => {
    const handleOnline = () => {
      if (dirtyRef.current) void persist();
    };
    const handleOffline = () => setSaveStatus('offline');
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [persist]);

  // Unmount: flush the pending save.
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (dirtyRef.current && editorRef.current) {
        void saveNote({
          id: note.id,
          title: titleRef.current,
          contentJson: JSON.parse(JSON.stringify(editorRef.current.getJSON())) as Record<string, unknown>,
        });
      }
    };
  }, [note.id]);

  // ⌘S — force save, bypassing the debounce (shortcuts.md editor table).
  useShortcut(
    'editor',
    'mod+s',
    () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      void persist();
    },
    { label: 'shortcuts.forceSave', requireModified: true },
  );

  /* ---------------- math + slash flows ---------------- */

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

  const commitMath = useCallback((latex: string, panel: MathPanel) => {
    const ed = editorRef.current;
    if (!ed) return;
    if (panel.editPos !== undefined) {
      const update = panel.mode === 'inline'
        ? ed.chain().focus().updateInlineMath({ latex, pos: panel.editPos })
        : ed.chain().focus().updateBlockMath({ latex, pos: panel.editPos });
      update.run();
    } else if (panel.mode === 'inline') {
      ed.chain().focus().insertInlineMath({ latex }).run();
    } else {
      ed.chain().focus().insertBlockMath({ latex }).run();
    }
    setMathPanel(null);
  }, []);

  const isAtStartOfEmptyBlock = useCallback((ed: Editor): boolean => {
    const { $from } = ed.state.selection;
    return $from.parent.isTextblock && $from.parent.textContent.length === 0 && $from.parentOffset === 0;
  }, []);

  const handleEditorKeyDown = useCallback(
    (_view: unknown, event: KeyboardEvent): boolean => {
      const ed = editorRef.current;
      if (!ed) return false;

      // ⌘M / ⌘⇧M — inline / display math.
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'm') {
        event.preventDefault();
        if (event.shiftKey) openDisplayMath();
        else openInlineMath();
        return true;
      }

      // `$` — the progressive-disclosure state machine (AC3/AC4).
      // On an empty block the first `$` arms a pending flag so `$$` can be
      // read as "display equation" before the MathInput takes focus.
      if (event.key === '$') {
        event.preventDefault();
        if (pendingDollarRef.current && isAtStartOfEmptyBlock(ed)) {
          pendingDollarRef.current = false;
          openDisplayMath();
        } else if (pendingDollarRef.current) {
          pendingDollarRef.current = false;
          openInlineMath();
        } else if (isAtStartOfEmptyBlock(ed)) {
          pendingDollarRef.current = true;
        } else {
          openInlineMath();
        }
        return true;
      }
      // The character after a pending `$` seeds the inline input (e.g. `$a`).
      if (pendingDollarRef.current) {
        if (event.key.length === 1) {
          event.preventDefault();
          pendingDollarRef.current = false;
          openInlineMath(event.key);
          return true;
        }
        pendingDollarRef.current = false;
        return false;
      }

      // `/` — slash menu, only at the start of an empty block (AC2).
      if (event.key === '/') {
        if (isAtStartOfEmptyBlock(ed)) {
          event.preventDefault();
          const coords = ed.view.coordsAtPos(ed.state.selection.from);
          setSlashPosition({ top: coords.bottom, left: coords.left });
          setSlashOpen(true);
        }
        return false;
      }

      return false;
    },
    [isAtStartOfEmptyBlock, openDisplayMath, openInlineMath],
  );

  /* ---------------- Tiptap ---------------- */

  const extensions = useMemo(
    () => [
      Placeholder.configure({ placeholder: t('placeholder') }),
      StarterKit.configure({
        hardBreak: false,
        horizontalRule: false,
        link: false,
        strike: false,
        underline: false,
      }),
      InlineMathNoRules.configure({
        katexOptions: { ...KATEX_OPTIONS },
        onClick: mathOnClick('inline'),
      }),
      BlockMathNoRules.configure({
        katexOptions: { ...KATEX_OPTIONS },
        onClick: mathOnClick('display'),
      }),
    ],
    [t],
  );

  // PM's doc schema is `block+` — an empty doc has no renderable height, so a
  // fresh note starts with one empty paragraph. The editor's TrailingNode
  // plugin keeps the last block present from then on.
  const initialContent = note.contentJson.content.length > 0
    ? unionToProse(note.contentJson)
    : { type: 'doc', content: [{ type: 'paragraph' }] };

  const editor = useEditor({
    extensions,
    content: initialContent,
    immediatelyRender: false,
    editable: isTablet,
    editorProps: {
      attributes: {
        // Consistent on-grid internal padding — overrides ProseMirror's
        // default CSS which gives inconsistent (off-grid) spacing. px-3
        // (12px) horizontal, py-2 (8px) vertical — both in spacing set {3,2}.
        class: 'px-3 py-2',
      },
      handleKeyDown: handleEditorKeyDown,
    },
    onUpdate: ({ editor: ed }) => {
      // Derive the outline from headings (for the ≥1440px rail).
      const items: OutlineItem[] = [];
      ed.state.doc.descendants((node, pos) => {
        if (node.type.name === 'heading') {
          items.push({ level: node.attrs.level as number, text: node.textContent, pos });
        }
        return true;
      });
      setOutline(items);
      scheduleSave();
    },
  });

  // Keep refs in sync with the latest render (refs must not be mutated in render).
  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  // Same for the module handle the math extensions read at click time.
  useEffect(() => {
    editorHandle = editor ?? null;
    return () => {
      editorHandle = null;
    };
  }, [editor]);

  // `editable` is only read at editor creation, but useSyncExternalStore's
  // server snapshot (false) is what wins on the hydration render. Sync the
  // real value once the editor exists (AC10 depends on this flip).
  useEffect(() => {
    editor?.setEditable(isTablet);
  }, [editor, isTablet]);

  useEffect(() => {
    titleRef.current = title;
  }, [title]);

  /* ---------------- render ---------------- */

  const onTitleChange = useCallback(
    (value: string) => {
      setTitle(value);
      scheduleSave();
    },
    [scheduleSave],
  );

  const closeSlashMenu = useCallback(() => {
    setSlashOpen(false);
  }, []);

  const cancelSlashMenu = useCallback(() => {
    // Esc leaves the `/` as literal text (AC2).
    setSlashOpen(false);
    editorRef.current?.chain().focus().insertContent('/').run();
  }, []);

  return (
    <div className="relative flex min-h-screen min-w-0">
      {/* Reading surface: measure-capped, ruled margin line at the 68ch edge (§8). */}
      <div className="relative mx-auto w-full max-w-measure px-4 py-12">
        <div className="mb-8 flex items-center justify-between">
          <NoteTitleInput value={title} onChange={onTitleChange} />
          <SaveIndicator status={saveStatus} onRetry={() => void persist()} />
        </div>

        {/* 390px gate: read-only + clear message (AC10, design-system §6). */}
        {!isTablet && (
          <div className="mb-4 rounded-md border border-subtle bg-raised px-4 py-3 text-ui-sm text-secondary tablet:hidden">
            {t('mobileReadonly')}
          </div>
        )}

        <EditorContent editor={editor} />

        {/* Ruled margin hairline at the measure edge (§8 signature). */}
        <div
          aria-hidden="true"
          className="absolute bottom-0 left-[68ch] top-0 w-px bg-subtle opacity-50"
        />

        {/* Floating panels — anchored to cursor coordinates, fixed-position. */}
        {slashOpen && editor && (
          <SlashMenu
            editor={editor}
            position={slashPosition}
            onClose={closeSlashMenu}
            onCancel={cancelSlashMenu}
          />
        )}
        {mathPanel && (
          <MathInput
            mode={mathPanel.mode}
            initialLatex={mathPanel.initial}
            position={mathPanel.position}
            onCommit={(latex) => commitMath(latex, mathPanel)}
            onCancel={() => {
              // Escape cancels cleanly (AC3/AC5): return focus to the editor
              // so the student keeps typing where they left off. A microtask
              // runs after React commits the unmount (which would otherwise
              // move focus to <body>) but before the next keystroke task.
              setMathPanel(null);
              void Promise.resolve().then(() => {
                editorRef.current?.chain().focus().run();
              });
            }}
          />
        )}

        {/* Outline rail — ≥1440px only (design-system §6). */}
        {outline.length > 0 && (
          <nav
            aria-label={t('outline')}
            className="fixed right-6 top-24 hidden max-w-outline flex-col gap-1 desktop:flex"
          >
            {outline.map((item) => (
              <button
                key={item.pos}
                type="button"
                onClick={() => editor?.chain().focus().setTextSelection(item.pos).scrollIntoView().run()}
                className="truncate text-left text-ui-xs text-tertiary hover:text-primary"
                style={{ paddingLeft: `${(item.level - 1) * 8}px` }}
              >
                {item.text}
              </button>
            ))}
          </nav>
        )}
      </div>
    </div>
  );
}
