'use client';

/*
 * The whole deck, editable on one page.
 *
 * Front → Back → next card's Front on Tab; Tab from the last card's Back
 * appends a new one. Each row autosaves ~800ms after typing stops. Markdown
 * input rules and the LaTeX/KaTeX machinery are untouched — this is a new
 * surface around the same MathEditorField, not a new editor.
 *
 * Three constraints shape the code more than the layout does:
 *
 * 1. ONE shortcut registration for the page. The dispatcher fires only the
 *    last-registered match, so N rows each registering ⌘M would leave N-1 of
 *    them dead. This component registers once and routes to the focused field
 *    through the imperative handle.
 *
 * 2. ONLY the active row mounts real editors. 200 cards is 400 fields; every
 *    other field is a static render. See card-field-static.tsx.
 *
 * 3. DEMOTION IS SEQUENCED. The row being left stays mounted for one commit
 *    while the arriving row takes focus. Unmounting it in the same commit
 *    drops focus to <body> and the student's next keystrokes vanish — the
 *    slash-menu bug from specs/EVOLUTION.md 2026-08-07.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { NoteDoc } from '@neoformuflash/contracts';
import type { MathEditorFieldHandle } from '@/components/editor/math-editor-field';
import { SaveIndicator } from '@/components/editor/save-indicator';
import { Button } from '@/components/ui/button';
import { useIsTablet } from '@/lib/hooks/use-is-tablet';
import { useActiveScope } from '@/lib/shortcuts/use-scope';
import { useShortcut } from '@/lib/shortcuts/use-shortcut';
import { createCard, updateCard, deleteCard } from '@/app/app/decks/actions';
import { useCardRows, type CardRowSeed, type CardRowState } from '@/lib/decks/use-card-rows';
import { CardRow } from './card-row';

/** Rows rendered before the "show more" boundary. */
const REVEAL_STEP = 50;

type Side = 'front' | 'back';

/** Stable ref objects for one row's two editors. */
type CardFieldRefs = {
  front: { current: MathEditorFieldHandle | null };
  back: { current: MathEditorFieldHandle | null };
};
type Focus = { clientId: string; side: Side; pos: 'start' | 'end' };

export function MultiCardEditor({
  deckId,
  initialCards,
}: {
  deckId: string;
  initialCards: CardRowSeed[];
}) {
  const t = useTranslations('decks');
  const tEditor = useTranslations('editor');
  const isTablet = useIsTablet();

  /*
   * front/back handles per row, as STABLE ref objects.
   *
   * They have to be stable. A `ref={(handle) => ...}` callback built during
   * render is a new function every render, and React responds by calling the
   * old one with null and the new one with the handle — so on any re-render
   * the stored handle is transiently null. The blur timer below asks "does
   * either field of the active row still have focus?", and landing in that
   * window answered "no" and collapsed the row the student was typing in.
   *
   * Plain `{ current: null }` objects are valid React refs and never churn.
   */
  const [fieldStore] = useState(() => new Map<string, CardFieldRefs>());

  const refsFor = useCallback(
    (clientId: string): CardFieldRefs => {
      const existing = fieldStore.get(clientId);
      if (existing) return existing;
      const created: CardFieldRefs = { front: { current: null }, back: { current: null } };
      fieldStore.set(clientId, created);
      return created;
    },
    [fieldStore]
  );

  const readDocs = useCallback(
    (clientId: string) => {
      const pair = fieldStore.get(clientId);
      if (!pair?.front.current || !pair.back.current) return null;
      return { front: pair.front.current.getDoc(), back: pair.back.current.getDoc() };
    },
    [fieldStore]
  );

  const actions = useMemo(() => ({ createCard, updateCard, deleteCard }), []);
  const { rows, setDoc, appendRow, deleteRow, saveNow, retry } = useCardRows({
    deckId,
    initial: initialCards,
    actions,
    readDocs,
  });

  /*
   * `live` is a SET, not a single id, precisely so a hand-off can keep two
   * rows mounted for one commit (constraint 3).
   */
  const [live, setLive] = useState<Set<string>>(new Set());
  const [pendingFocus, setPendingFocus] = useState<Focus | null>(null);
  const [revealed, setRevealed] = useState(REVEAL_STEP);
  const activeRef = useRef<string | null>(null);
  /*
   * True between asking for a row to take focus and that row reporting it.
   *
   * Focus does not move synchronously: the arriving editor has to mount before
   * it can be focused, and in that gap the LEAVING field's blur fires while no
   * editor reports focus. Without this guard the blur handler reads that as
   * "the student left the grid", demotes everything, and the row the student
   * just clicked into collapses under them.
   */
  const handoffRef = useRef(false);

  /** Mount a row's editors and aim focus at one of its fields. */
  const promote = useCallback((clientId: string, side: Side, pos: 'start' | 'end') => {
    activeRef.current = clientId;
    handoffRef.current = true;
    setLive((current) => new Set(current).add(clientId));
    setPendingFocus({ clientId, side, pos });
  }, []);

  /*
   * Once the arriving row reports focus, every other row can be demoted. This
   * runs a commit AFTER the new editor exists, which is what keeps
   * document.activeElement off <body> during a hand-off.
   */
  const settleFocus = useCallback(() => {
    handoffRef.current = false;
    const keep = activeRef.current;
    if (!keep) return;
    setLive((current) => {
      if (current.size === 1 && current.has(keep)) return current;
      return new Set([keep]);
    });
  }, []);

  const demoteAll = useCallback(() => {
    const leaving = activeRef.current;
    activeRef.current = null;
    handoffRef.current = false;
    setPendingFocus(null);
    setLive(new Set());
    if (leaving) void saveNow(leaving);
  }, [saveNow]);

  /*
   * Blur is checked a microtask later: during a hand-off the old field blurs
   * before the new one focuses, and reacting immediately would tear the whole
   * grid down mid-Tab.
   */
  const handleFieldBlur = useCallback(() => {
    /*
     * A task, not a microtask: the arriving editor mounts and focuses across a
     * paint, which a microtask runs well before. Re-checked again after the
     * delay because a hand-off may still be in flight.
     */
    setTimeout(() => {
      if (handoffRef.current) return;
      const active = activeRef.current;
      if (!active) return;
      const pair = fieldStore.get(active);

      /*
       * An open equation panel counts as "still here".
       *
       * MathInput is portalled to document.body and takes focus when it opens,
       * so the editor underneath blurs. Treating that as "the student left"
       * demoted the row, which unmounted the very panel that had just opened —
       * ⌘M appeared to do nothing at all, and the row collapsed with it.
       */
      const panelOpen =
        pair?.front.current?.hasOpenMathPanel() || pair?.back.current?.hasOpenMathPanel();
      if (panelOpen) return;

      const stillHere =
        pair?.front.current?.isFocused() || pair?.back.current?.isFocused();
      if (!stillHere) demoteAll();
    }, 0);
  }, [demoteAll, fieldStore]);

  /*
   * The Tab machine. Returning false hands the key back to the browser.
   *
   * `rows` is a real dependency rather than a ref: MathEditorField reads
   * onTabOut through its own ref, so a new identity here costs nothing and
   * mutating a ref during render is what React's compiler rules forbid.
   */
  const handleTabOut = useCallback(
    (clientId: string, side: Side, direction: 'forward' | 'backward'): boolean => {
      const index = rows.findIndex((row) => row.clientId === clientId);
      if (index === -1) return false;

      if (direction === 'forward') {
        if (side === 'front') {
          fieldStore.get(clientId)?.back.current?.focus('start');
          return true;
        }
        /*
         * Deliberately NOT saving here. The row is already scheduled by its
         * own autosave, and the demote path flushes when focus really leaves
         * the grid. Firing an action on every Tab put a request in flight for
         * each field the student passed through — and a Server Action response
         * that gets aborted mid-interaction makes Next fall back to a HARD
         * navigation, which reloads the page and takes the row the student was
         * typing in with it.
         */
        const next = rows[index + 1];
        if (next) {
          promote(next.clientId, 'front', 'start');
          return true;
        }
        // Past the last card: add one. Synchronous, so Tab never waits on the
        // network, and a blank draft is never posted if the student stops here.
        const created = appendRow();
        promote(created.clientId, 'front', 'start');
        return true;
      }

      if (side === 'back') {
        fieldStore.get(clientId)?.front.current?.focus('end');
        return true;
      }
      const previous = rows[index - 1];
      if (!previous) {
        // Shift+Tab out of the very first field: let focus leave the grid.
        return false;
      }
      promote(previous.clientId, 'back', 'end');
      return true;
    },
    [appendRow, fieldStore, promote, rows]
  );

  /* ---------------- shortcuts: registered ONCE for the page ---------------- */

  useActiveScope('editor');

  const focusedField = useCallback((): MathEditorFieldHandle | null => {
    for (const clientId of live) {
      const pair = fieldStore.get(clientId);
      if (pair?.front.current?.isFocused()) return pair.front.current;
      if (pair?.back.current?.isFocused()) return pair.back.current;
    }
    const active = activeRef.current;
    if (!active) return null;
    const pair = fieldStore.get(active);
    return pair?.front.current ?? pair?.back.current ?? null;
  }, [fieldStore, live]);

  const openMath = useCallback(
    (display: boolean) => {
      const field = focusedField();
      if (!field) return;
      if (display) field.openDisplayMath();
      else field.openInlineMath();
    },
    [focusedField]
  );

  useShortcut('editor', 'mod+m', () => openMath(false), {
    label: 'shortcuts.editor.inlineMath',
  });
  useShortcut('editor', 'mod+shift+m', () => openMath(true), {
    label: 'shortcuts.editor.displayMath',
  });

  useShortcut(
    'editor',
    'Escape',
    () => {
      /*
       * The provider listens on window with capture:true, so this fires BEFORE
       * MathInput's own Escape handler and preventDefault does not stop it.
       * Without this guard, Escape inside an open equation both cancels the
       * panel and collapses the row underneath it.
       */
      if (focusedField()?.hasOpenMathPanel()) return;
      demoteAll();
    },
    { label: 'shortcuts.editor.cancel', allowInEditable: true }
  );

  useShortcut(
    'editor',
    'mod+s',
    () => {
      const active = activeRef.current;
      if (active) void saveNow(active);
    },
    { label: 'shortcuts.forceSave' }
  );

  /* ---------------- reveal window ---------------- */

  const sentinelRef = useRef<HTMLDivElement>(null);
  const hasMore = revealed < rows.length;

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasMore) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setRevealed((current) => current + REVEAL_STEP);
      }
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, revealed]);

  /* ---------------- render ---------------- */

  /*
   * design-system.md §6: the editor is read-only below tablet. The gate is
   * useSyncExternalStore-backed, so SSR emits this branch and a desktop load
   * never flashes it.
   */
  if (!isTablet) {
    return (
      <div className="rounded-md border border-subtle bg-raised p-4">
        <p className="text-ui-sm text-secondary">{tEditor('mobileReadonly')}</p>
      </div>
    );
  }

  const visible = rows.slice(0, revealed);
  const aggregate = aggregateStatus(rows);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-4">
        <p className="text-ui-xs text-tertiary">{t('cardGrid.tabHint')}</p>
        <SaveIndicator status={aggregate} />
      </div>

      <ol className="flex flex-col">
        {visible.map((row, index) => (
          <CardRow
            key={row.clientId}
            row={row}
            index={index + 1}
            live={live.has(row.clientId)}
            focusTarget={
              pendingFocus?.clientId === row.clientId
                ? { side: pendingFocus.side, pos: pendingFocus.pos }
                : null
            }
            frontRef={refsFor(row.clientId).front}
            backRef={refsFor(row.clientId).back}
            onActivate={(side) => promote(row.clientId, side, 'end')}
            onChange={(side, doc: NoteDoc) => setDoc(row.clientId, side, doc)}
            onTabOut={(side, direction) => handleTabOut(row.clientId, side, direction)}
            onFieldFocus={settleFocus}
            onFieldBlur={handleFieldBlur}
            onDelete={() => deleteRow(row.clientId)}
            onRetry={() => void retry(row.clientId)}
          />
        ))}
      </ol>

      {hasMore ? (
        <div ref={sentinelRef} className="py-4 text-center">
          {/* A real button, not only the observer: nothing may be reachable
              exclusively through an IntersectionObserver. */}
          <Button variant="secondary" onClick={() => setRevealed((c) => c + REVEAL_STEP)}>
            {t('cardGrid.showMore')}
          </Button>
        </div>
      ) : null}

      <div className="pt-2">
        <Button
          variant="primary"
          onClick={() => {
            const created = appendRow();
            setRevealed((current) => Math.max(current, rows.length + 1));
            promote(created.clientId, 'front', 'start');
          }}
        >
          {t('detail.addCard')}
        </Button>
      </div>
    </div>
  );
}

/**
 * One status for the whole grid, worst-first: a single failed row must not be
 * hidden by twenty saved ones.
 */
function aggregateStatus(rows: CardRowState[]) {
  if (rows.some((row) => row.status === 'error')) return 'error' as const;
  if (rows.some((row) => row.status === 'offline')) return 'offline' as const;
  if (rows.some((row) => row.status === 'saving')) return 'saving' as const;
  if (rows.some((row) => row.status === 'saved')) return 'saved' as const;
  return 'idle' as const;
}
