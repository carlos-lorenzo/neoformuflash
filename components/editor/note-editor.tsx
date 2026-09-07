// Client: the composite editor. Owns the Tiptap instance, title, autosave
// lifecycle (debounced, retried, offline-aware), the `$` / `/` / ⌘M / ⌘⇧M
// keyboard flows, the floating panels, and the 390px read-only gate.
//
// Server component renders the shell; Tiptap mounts client-side
// (immediatelyRender: false) so there is no hydration mismatch.

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useEditor, EditorContent } from '@tiptap/react';
import type { Editor } from '@tiptap/core';
import { buildEditorExtensions } from '@/lib/editor/tiptap-extensions';
import { useIsTablet } from '@/lib/hooks/use-is-tablet';
import { findMathAtClick } from '@/lib/editor/math-click';
import { deriveTitle } from '@/lib/editor/derive-title';
import { unionToProse } from '@/lib/editor/serialize';
import { saveNote } from '@/app/app/notes/actions';
import { getApiKeyStatusAction } from '@/app/app/settings/ai-keys/actions';
import { useActiveScope } from '@/lib/shortcuts/use-scope';
import { useShortcut } from '@/lib/shortcuts/use-shortcut';
import type { NoteRow } from '@/lib/db/notes';
import { NoteDocView } from '@/components/note/note-doc-view';
import { SaveIndicator, type SaveStatus } from './save-indicator';
import { MathInput } from './math-input';
import Link from 'next/link';
import { SlashMenu } from './slash-menu';
import { CopilotMenu } from '@/components/ai/copilot-menu';
import { SelectionToolbar } from './selection-toolbar';
import { SeoForm } from './seo-form';
import { PublishForm } from './publish-form';
import './katex-client';

/*
 * The extension's input rules convert literal `$$...$$` text into math nodes —
 * that would bypass the MathInput's validation. The `$` state machine below
 * owns the trigger, so the rules are disabled in the shared config.
 */

const AUTOSAVE_MS = 800;

function SparklesIcon({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </svg>
  );
}

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
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function NoteEditor({ note, courseName, isOwner = true }: { note: NoteRow; courseName?: string | null; isOwner?: boolean }) {
  const t = useTranslations('editor');
  const tn = useTranslations('notes');
  const isTablet = useIsTablet();
  useActiveScope('editor');

  const [title, setTitle] = useState(note.title);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [mathPanel, setMathPanel] = useState<MathPanel | null>(null);
  const [slashOpen, setSlashOpen] = useState(false);
  const [slashPosition, setSlashPosition] = useState<PanelPosition>({ top: 0, left: 0 });
  const [slashInline, setSlashInline] = useState(false);
  const [outline, setOutline] = useState<OutlineItem[]>([]);

  // Copilot state
  const [hasAiKey, setHasAiKey] = useState(false);
  const [aiProviders, setAiProviders] = useState<Array<'openai' | 'anthropic' | 'google' | 'deepseek'>>([]);
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [copilotAction, setCopilotAction] = useState<'generate' | 'explain' | 'summarize' | 'rephrase' | 'continue' | 'fix_latex' | 'generate_cards' | null>(null);
  const [copilotSelection, setCopilotSelection] = useState<string | null>(null);
  const [copilotProvider, setCopilotProvider] = useState<'openai' | 'anthropic' | 'google' | 'deepseek' | null>(null);

  // Check AI key status on mount (only shows AI actions when a key exists)
  useEffect(() => {
    if (!isOwner) return;
    getApiKeyStatusAction()
      .then((res) => {
        if (res.ok) {
          const providers = (['openai', 'anthropic', 'google', 'deepseek'] as const).filter(
            (p) => res.value.hasKeys[p]
          );
          if (providers.length > 0) {
            setHasAiKey(true);
            setAiProviders(providers);
          }
        }
      })
      .catch(() => {});
  }, [isOwner]);

  // Track selection changes for copilot context. The selection snapshot is
  // updated via a Tiptap callback attached in onCreate (using the editor
  // instance captured there, never editorRef — which keeps the immutability
  // lint rule from flagging the editorRef writes in onCreate/onDestroy).
  const handleSelectionUpdate = useCallback((editor: Editor) => {
    const { from, to } = editor.state.selection;
    const text = from !== to ? editor.state.doc.textBetween(from, to, ' ') : null;
    setCopilotSelection(text);
  }, []);

  const closeCopilot = useCallback(() => {
    setCopilotOpen(false);
    setCopilotAction(null);
    setCopilotProvider(null);
  }, []);

  const editorRef = useRef<Editor | null>(null);
  const titleRef = useRef(title);
  const dirtyRef = useRef(false);
  const retriedRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingDollarRef = useRef(false);

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

  /*
   * Whether a `/` at the current caret should open the slash menu rather than be
   * typed as a literal slash. The caret must be inside a textblock, outside code,
   * and at a token boundary — the block start or right after whitespace — so
   * typing "https://…", "3/4" or "path/to" never pops the menu.
   */
  const isSlashTrigger = useCallback((ed: Editor): boolean => {
    const { $from } = ed.state.selection;
    const parent = $from.parent;
    if (!parent.isTextblock) return false;
    if ($from.parentOffset === 0) return true;
    const charBefore = parent.textBetween($from.parentOffset - 1, $from.parentOffset, null, '\ufffc');
    return /\s/.test(charBefore);
  }, []);

  /* `/` while the caret is inside a code context must stay a literal slash. */
  const isCodeContext = useCallback((ed: Editor): boolean => {
    const { $from } = ed.state.selection;
    if ($from.parent.type.spec.code) return true;
    const codeMark = $from.marks().some((m) => m.type.name === 'code');
    if (codeMark) return true;
    // The slash itself will be typed between two code-marked nodes.
    if (($from.nodeBefore?.marks ?? []).some((m) => m.type.name === 'code') ||
        ($from.nodeAfter?.marks ?? []).some((m) => m.type.name === 'code')) return true;
    return false;
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

      // `/` — slash menu or AI copilot.
      // When text is selected, `/` opens the copilot menu for the selection
      // (instead of inserting literal `/` and overwriting the selection).
      // Otherwise `/` opens the slash menu (AC2) — at the start of an empty
      // block it applies to the whole block, mid-line it splits at the caret
      // first so the text after it becomes the chosen block.
      if (event.key === '/') {
        const { from, to } = ed.state.selection;
        const hasSelection = from !== to;

        if (hasSelection) {
          event.preventDefault();
          const selText = ed.state.doc.textBetween(from, to, ' ');
          setCopilotSelection(selText);
          setCopilotAction('explain');
          setCopilotOpen(true);
          return true;
        } else if (isSlashTrigger(ed) && !isCodeContext(ed)) {
          event.preventDefault();
          const coords = ed.view.coordsAtPos(ed.state.selection.from);
          setSlashOpen(true);
          setSlashInline(ed.state.selection.$from.parentOffset > 0);
          setSlashPosition({ top: coords.bottom, left: coords.left });
          return true;
        }
      }

      return false;
    },
    [openDisplayMath, openInlineMath, isAtStartOfEmptyBlock, isSlashTrigger, isCodeContext],
  );

  const handleSlashClose = useCallback(() => {
    setSlashOpen(false);
  }, []);

  const handleSlashCancel = useCallback(() => {
    setSlashOpen(false);
    // Escape cancels cleanly (AC2): leave the `/` as literal text and return
    // focus to the editor so the student keeps typing where they left off.
    editorRef.current?.chain().focus().insertContent('/').run();
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

  /* ---------------- offline queue ---------------- */

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

  /* ---------------- outline (tablet+) ---------------- */

  // Rebuilt from the editor's own callbacks (onCreate/onUpdate) rather than an
  // effect keyed on `editorRef.current?.state.doc.content` — reading a ref
  // during render to build the deps array trips react-hooks/refs.
  const rebuildOutline = useCallback((ed: Editor) => {
    const items: OutlineItem[] = [];
    ed.state.doc.descendants((node, pos) => {
      if (node.type.name.startsWith('heading')) {
        const level = parseInt(node.type.name.slice(-1), 10);
        const text = node.textContent.slice(0, 80);
        items.push({ level, text, pos });
      }
    });
    setOutline(items);
  }, []);

  const extensions = useMemo(
    () => buildEditorExtensions(t('notePlaceholder')),
    [t]
  );

  // Build initial editor content. If the note has an empty body, prepend the
  // title as a Notion-style first h1 block followed by an empty paragraph —
  // built synchronously so the editor never mutates after mount (which would
  // race with user keystrokes).
  const initialContent = useMemo(() => {
    const content = unionToProse(note.contentJson);
    const hasBody = content.content && content.content.length > 0;

    if (!hasBody) {
      return {
        type: 'doc' as const,
        content: [
          { type: 'heading', attrs: { level: 1 }, content: note.title ? [{ type: 'text', text: note.title }] : undefined },
          { type: 'paragraph' },
        ],
      };
    }
    return content;
  }, [note.contentJson, note.title]);

  const editor = useEditor({
    extensions,
    content: initialContent,
    immediatelyRender: false,
    autofocus: 'end',
    editable: isTablet && isOwner,
    editorProps: {
      attributes: { class: 'w-full min-h-editor' },
      handleKeyDown: handleEditorKeyDown,
      // Clicking a rendered math node opens its edit panel. Event handler, so
      // reading the panel state is fine — see lib/editor/math-click.ts.
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
    },
    onUpdate: ({ editor }) => {
      rebuildOutline(editor);
      scheduleSave();

      // Sync title from first non-empty block (heading or paragraph)
      const { doc } = editor.state;
      const newTitle = deriveTitle(doc.toJSON());
      if (newTitle !== titleRef.current) {
        titleRef.current = newTitle;
        setTitle(newTitle);
      }
    },
    onCreate: ({ editor }) => {
      editorRef.current = editor;
      editor.on('selectionUpdate', () => handleSelectionUpdate(editor));
      rebuildOutline(editor);
    },
    onDestroy: () => {
      editorRef.current = null;
    },
  });

  // Open the copilot menu with the current selection. Defined after `editor` so
  // the immutable-refs lint rule doesn't flag the editorRef writes above.
  const openCopilot = useCallback((
    action: 'generate' | 'explain' | 'summarize' | 'rephrase' | 'continue' | 'fix_latex' | 'generate_cards',
    provider?: 'openai' | 'anthropic' | 'google' | 'deepseek'
  ) => {
    if (!editor) return;

    const { from, to } = editor.state.selection;
    const selText = from !== to ? editor.state.doc.textBetween(from, to, ' ') : null;

    setCopilotAction(action);
    setSlashOpen(false);
    setCopilotSelection(selText);
    if (provider) {
      setCopilotProvider(provider);
    } else if (aiProviders.length > 0 && !copilotProvider) {
      setCopilotProvider(aiProviders[0] as 'openai' | 'anthropic' | 'google' | 'deepseek');
    }
    setCopilotOpen(true);
  }, [editor, aiProviders, copilotProvider]);

  // ⌘J — open AI Copilot for generating new content (no selection needed).
  // This allows users to generate content from scratch without selecting text first.
  useShortcut(
    'editor',
    'mod+j',
    () => {
      if (hasAiKey && editor) {
        openCopilot('generate');
      }
    },
    { label: 'shortcuts.openCopilot', requireModified: true },
  );

  // Sync editable state with tablet breakpoint
  useEffect(() => {
    editor?.setEditable(isTablet);
  }, [editor, isTablet]);

  /* ---------------- render ---------------- */

  if (!isTablet) {
    return (
      <div className="flex min-h-dvh flex-col bg-base">
        {/* Breadcrumb + save status. Inline (not fixed) so the indicator never
            overlaps the app-shell header's settings menu at the top right. */}
        <div className="mx-auto flex w-full max-w-measure items-center justify-between gap-2 px-4 py-2">
          {courseName ? (
            <nav
              className="min-w-0 truncate text-ui-sm text-secondary"
              aria-label={tn('breadcrumb')}
            >
              <Link
                href={`/app/courses/${note.courseId}`}
                className="hover:underline"
              >
                {courseName}
              </Link>
              <span aria-hidden="true"> / </span>
              <span aria-current="page">{title}</span>
            </nav>
          ) : (
            <span />
          )}
          <SaveIndicator status={saveStatus} className="shrink-0" />
        </div>
        <div className="mx-auto w-full max-w-measure flex-1 overflow-auto px-4 py-4">
          {/* Title — integrated as the first block (Notion style) */}
          <h1 className="font-serif text-read-h1 font-semibold text-primary">{title}</h1>

          {/* Read-only message at 390px */}
          <div className="mt-2 mb-4 rounded-md border border-subtle bg-raised px-4 py-3 text-ui-sm text-secondary">
            {t('mobileReadonly')}
          </div>
          <NoteDocView doc={note.contentJson} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col bg-base">
      {/* Breadcrumb + save status. Inline (not fixed) so the indicator never
          overlaps the app-shell header's settings menu at the top right. */}
      <div className="mx-auto flex w-full max-w-measure items-center justify-between gap-2 px-4 py-2">
        {courseName ? (
          <nav
            className="min-w-0 truncate text-ui-sm text-secondary"
            aria-label={tn('breadcrumb')}
          >
            <Link
              href={`/app/courses/${note.courseId}`}
              className="hover:underline"
            >
              {courseName}
            </Link>
            <span aria-hidden="true"> / </span>
            <span aria-current="page">{title}</span>
          </nav>
        ) : (
          <span />
        )}
        <SaveIndicator status={saveStatus} className="shrink-0" />
      </div>

      {/* Editor canvas - borderless, seamless with page background */}
      <div className="flex-1 overflow-auto p-4">
        <div className="mx-auto w-full max-w-measure">
          {/* Copilot trigger — inside the editor column, not a fixed overlay,
              so it never sits on top of the app-shell's left sidebar. */}
          {isOwner && hasAiKey && (
            <div className="mb-2 flex justify-end">
              <button
                type="button"
                onClick={() => openCopilot('generate')}
                className="flex h-11 items-center gap-2 rounded-md border border-subtle bg-raised px-3 text-ui-sm text-secondary transition-colors hover:bg-inset hover:text-primary"
                aria-label={t('openCopilot')}
              >
                <SparklesIcon className="size-4" />
                <span>{t('openCopilot')}</span>
              </button>
            </div>
          )}
          <div className="prose prose-sm max-w-none">
            <EditorContent
              editor={editor}
              className="w-full min-h-editor"
            />
          </div>
        </div>
      </div>

      {/* Slash menu */}
      {slashOpen && editor && (
        <SlashMenu
          editor={editor}
          position={slashPosition}
          onClose={handleSlashClose}
          onCancel={handleSlashCancel}
          onInsertInlineEquation={openInlineMath}
          onInsertBlockEquation={openDisplayMath}
          hasAiKey={hasAiKey}
          availableProviders={aiProviders}
          defaultProvider={aiProviders[0]}
          onOpenCopilot={openCopilot}
          inline={slashInline}
        />
      )}

      {/* Selection toolbar (floating, appears on selection) */}
      {isTablet && editor && hasAiKey && (
        <SelectionToolbar editor={editor} onAskAI={() => openCopilot('explain')} />
      )}

      {/* Math input panel */}
      {mathPanel && (
        <MathInput
          mode={mathPanel.mode}
          initialLatex={mathPanel.initial}
          position={mathPanel.position}
          onCommit={(latex) => commitMath(latex, mathPanel)}
          onCancel={() => {
            setMathPanel(null);
            // Return focus to editor after cancel (same microtask pattern as slash menu).
            void Promise.resolve().then(() => {
              editorRef.current?.chain().focus().run();
            });
          }}
        />
      )}

      {/* Sidebar: outline + SEO (tablet+) */}
      <aside className="fixed right-4 bottom-4 z-20 w-outline max-h-outline overflow-auto rounded-lg border border-subtle bg-raised p-2 shadow-dialog animate-dialog">
        {outline.length > 0 && (
          <div className="mb-4">
            <p className="text-ui-xs font-medium tracking-ui text-tertiary uppercase mb-2">{t('outline')}</p>
            <ul className="flex flex-col gap-1">
              {outline.map((item) => (
                <li
                  key={item.pos}
                  className="text-ui-sm text-secondary hover:text-primary cursor-pointer pl-2"
                  onClick={() => editorRef.current?.commands.scrollIntoView()}
                >
                  {'  '.repeat(item.level - 1)}{item.text}
                </li>
              ))}
            </ul>
          </div>
        )}

        {isOwner && (
          <>
            {/* SEO form - only on tablet+ where editor is editable */}
            <SeoForm
              noteId={note.id}
              initial={{
                ogTitle: '',
                ogDescription: '',
                ogImageUrl: '',
              }}
            />

            {/* Publish form - only on tablet+ where editor is editable */}
            <PublishForm
              noteId={note.id}
              isPublished={note.publishedAt !== null}
            />
          </>
        )}
      </aside>

      {/* Copilot menu */}
      {copilotOpen && copilotAction && editor && (
        <CopilotMenu
          editor={editor}
          selectionText={copilotSelection}
          onClose={closeCopilot}
          isOpen={copilotOpen}
          noteId={note.id}
          availableProviders={aiProviders}
          defaultProvider={copilotProvider ?? aiProviders[0]}
        />
      )}
    </div>
  );
}