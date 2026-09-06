'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { NoteDoc } from '@neoformuflash/contracts';

/*
 * The row / autosave / create / delete machine behind the multi-card deck
 * editor. All of it lives here rather than in the component because the two
 * things most likely to break are invisible in the DOM:
 *
 *   1. The CREATE RACE. createCard computes `position` as max(position)+1
 *      server-side, so two concurrent creates read the same max. `position` is
 *      not unique and listCards only tie-breaks on created_at, so the result
 *      is cards silently out of order — under fast typing, which is exactly
 *      when a student is adding cards. Creates are therefore serialized
 *      through ONE promise chain per page.
 *
 *   2. The SAVE/CREATE INTERLEAVE. Typing during an in-flight create must not
 *      issue a second createCard, and must not lose the keystrokes either. A
 *      per-row in-flight promise makes the second write wait for the id, then
 *      go out as an update.
 *
 * Save semantics are carried over from components/editor/note-editor.tsx: one
 * automatic retry, then error with a manual retry; offline short-circuits
 * without a request and flushes on reconnect.
 */

export type RowStatus = 'idle' | 'saving' | 'saved' | 'error' | 'offline';

export type CardRowState = {
  /** Stable React key. Never changes, including once the row gains a server id. */
  clientId: string;
  /** Null until the row has been created server-side. */
  serverId: string | null;
  front: NoteDoc;
  back: NoteDoc;
  status: RowStatus;
  /** Catalog key, never prose. */
  errorCode: string | null;
};

export type CardRowSeed = {
  id: string;
  frontJson: NoteDoc;
  backJson: NoteDoc;
};

export type CardActions = {
  createCard: (input: {
    deckId: string;
    frontJson: NoteDoc;
    backJson: NoteDoc;
  }) => Promise<{ id?: string; errors?: { form?: string } }>;
  /*
   * Content-only update. Review scheduling lives in card_states (apply_review),
   * never in fields the editor sends, so an autosave can't clobber it.
   */
  updateCard: (input: {
    id: string;
    deckId: string;
    frontJson: NoteDoc;
    backJson: NoteDoc;
  }) => Promise<{ savedAt?: string; errors?: { form?: string } }>;
  deleteCard: (input: { id: string }) => Promise<{ errors?: { form?: string } }>;
};

export const AUTOSAVE_MS = 800;

export const EMPTY_DOC: NoteDoc = { type: 'doc', content: [] };

let counter = 0;
/** Unique within a page. crypto.randomUUID is not available on every target. */
function nextClientId(): string {
  counter += 1;
  return `row-${Date.now().toString(36)}-${counter}`;
}

function isBlank(doc: NoteDoc | undefined): boolean {
  if (!doc?.content || doc.content.length === 0) return true;
  return doc.content.every((block) => {
    const inline = (block as { content?: unknown[] }).content;
    return !inline || inline.length === 0;
  });
}

function seedRow(seed: CardRowSeed): CardRowState {
  return {
    clientId: nextClientId(),
    serverId: seed.id,
    front: seed.frontJson,
    back: seed.backJson,
    status: 'idle',
    errorCode: null,
  };
}

/*
 * Rows that survive a remount, keyed by deck.
 *
 * Completing a Server Action makes Next re-render the route, and that
 * re-render REMOUNTS this hook's component — verified in the browser, not
 * assumed: the mount effect fires twice and useState re-runs its initializer
 * with whatever `listCards` returned. Every local row is discarded.
 *
 * The visible symptom is brutal and easy to misread as a Tab bug: you Tab past
 * the last card, the new row appears, and a moment later — when the previous
 * row's autosave lands — the row vanishes and focus is gone.
 *
 * So the seed merges instead of replacing. Server rows are authoritative for
 * content and order; local rows that the server has never heard of (drafts
 * with no id) are carried across, and a row that already exists keeps its
 * clientId so refs, focus and in-flight saves stay attached to it.
 */
const survivors = new Map<string, CardRowState[]>();

function reseed(deckId: string, initial: CardRowSeed[]): CardRowState[] {
  const previous = survivors.get(deckId);
  if (!previous) {
    const fresh = initial.map(seedRow);
    survivors.set(deckId, fresh);
    return fresh;
  }

  const byServerId = new Map(
    previous.filter((row) => row.serverId).map((row) => [row.serverId!, row])
  );

  const merged = initial.map((card) => {
    const kept = byServerId.get(card.id);
    if (!kept) return seedRow(card);

    /*
     * Only a row with work the server has not acknowledged wins outright.
     * Preferring the local copy unconditionally would let a stale cache shadow
     * newer content forever — including an edit made on another device.
     */
    const hasUnsavedWork = kept.status !== 'idle' && kept.status !== 'saved';
    if (hasUnsavedWork) return kept;

    // Otherwise take the server's content but keep the clientId, so the live
    // editors, pending saves and focus stay attached to the same row.
    return { ...seedRow(card), clientId: kept.clientId };
  });

  // Drafts the server cannot know about yet — including the one just added by
  // tabbing past the end, which is the whole reason this exists.
  for (const row of previous) {
    if (!row.serverId) merged.push(row);
  }

  survivors.set(deckId, merged);
  return merged;
}

export function draftRow(): CardRowState {
  return {
    clientId: nextClientId(),
    serverId: null,
    front: EMPTY_DOC,
    back: EMPTY_DOC,
    status: 'idle',
    errorCode: null,
  };
}

export type UseCardRowsOptions = {
  deckId: string;
  initial: CardRowSeed[];
  actions: CardActions;
  /**
   * Reads the live document straight from a mounted editor, bypassing both the
   * field's 150ms onChange debounce and this hook's 800ms one. Returns null for
   * a row whose editors are not mounted, in which case the stored doc is used.
   */
  readDocs?: (clientId: string) => { front: NoteDoc; back: NoteDoc } | null;
};

export function useCardRows({ deckId, initial, actions, readDocs }: UseCardRowsOptions) {
  /*
   * The authoritative store is a ref, not state.
   *
   * Everything here — is this draft still blank, does this row have a server
   * id yet — is read inside async callbacks that can run before React has
   * re-rendered. Deriving those answers from state made correctness depend on
   * render scheduling: a save fired in the same tick as a keystroke read the
   * PREVIOUS document and skipped the create entirely, and a save queued
   * behind a create could not see the id the create had just written.
   *
   * So: mutate the map synchronously, then publish a snapshot for rendering.
   *
   * Seeded ONCE. The deck page is a server component that owns `cards`, so
   * re-deriving rows from props would let a router.refresh() stomp on whatever
   * the student is typing.
   */
  const [seed] = useState(() => reseed(deckId, initial));

  /*
   * The ref is authoritative; `rows` is a published copy for rendering.
   *
   * It has to be a ref because every read here happens inside an async
   * callback that can run before React re-renders — "is this draft still
   * blank", "does this row have a server id yet". Reading those from state
   * made correctness depend on render scheduling: a save fired in the same
   * tick as a keystroke saw the PREVIOUS document and skipped the create, and
   * a save queued behind a create could not see the id it had just written.
   *
   * `useRef(seed)` rather than a lazy initializer: `seed` is already memoised
   * by useState, so this costs nothing per render and never writes .current
   * during one.
   */
  const listRef = useRef<CardRowState[]>(seed);
  const [rows, setRows] = useState<CardRowState[]>(seed);

  /** Publish the ref's contents to React. Never the other way round. */
  const commit = useCallback(() => {
    const next = [...listRef.current];
    // Mirrored so a remount can pick these up again — see `reseed`.
    survivors.set(deckId, next);
    setRows(next);
  }, [deckId]);

  const timersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const dirtyRef = useRef(new Set<string>());
  /** Per-row in-flight write, so a second save waits rather than racing. */
  const inFlightRef = useRef(new Map<string, Promise<void>>());
  /** Rows deleted while their create was still in flight. */
  const pendingDeleteRef = useRef(new Set<string>());
  /** The page-wide create queue — see note 1 at the top of this file. */
  const createQueueRef = useRef<Promise<unknown>>(Promise.resolve());

  const patch = useCallback(
    (clientId: string, next: Partial<CardRowState>) => {
      let changed = false;
      listRef.current = listRef.current.map((row) => {
        if (row.clientId !== clientId) return row;
        changed = true;
        return { ...row, ...next };
      });
      if (changed) commit();
    },
    [commit]
  );

  const removeRow = useCallback(
    (clientId: string) => {
      listRef.current = listRef.current.filter((row) => row.clientId !== clientId);
      commit();
    },
    [commit]
  );

  /** Latest content for a row: live editors first, then the store. */
  const snapshot = useCallback(
    (clientId: string) => {
      const row = listRef.current.find((candidate) => candidate.clientId === clientId);
      const live = readDocs?.(clientId);
      return {
        row,
        front: live?.front ?? row?.front ?? EMPTY_DOC,
        back: live?.back ?? row?.back ?? EMPTY_DOC,
      };
    },
    [readDocs]
  );

  const persist = useCallback(
    async (clientId: string): Promise<void> => {
      // Never two writes for one row at once: the second waits, then re-reads,
      // so a keystroke during an in-flight create goes out as an update rather
      // than a duplicate create.
      const previous = inFlightRef.current.get(clientId);
      if (previous) await previous;

      const run = (async () => {
        /*
         * Two attempts, as a loop rather than recursion: one automatic retry
         * covers a network blip without a click, and stopping at two means a
         * genuine failure reaches the student instead of spinning. The content
         * is re-read each attempt, so a retry never persists a stale document.
         */
        for (let attempt = 0; attempt < 2; attempt += 1) {
          const { row, front, back } = snapshot(clientId);
          if (!row) return;

          // A draft nobody has typed into is not a card. This is what makes
          // "Tab past the end to add a row" free: overshooting costs no
          // request and leaves no empty card behind.
          if (!row.serverId && isBlank(front) && isBlank(back)) {
            dirtyRef.current.delete(clientId);
            return;
          }

          if (typeof navigator !== 'undefined' && navigator.onLine === false) {
            dirtyRef.current.add(clientId);
            patch(clientId, { status: 'offline' });
            return;
          }

          dirtyRef.current.delete(clientId);
          patch(clientId, { status: 'saving', errorCode: null });

          try {
            if (row.serverId) {
              const result = await actions.updateCard({
                id: row.serverId,
                deckId,
                frontJson: front,
                backJson: back,
              });
              if (result.errors?.form) throw new Error(result.errors.form);
              /*
               * Status only. Writing the captured `front`/`back` back into the
               * store would overwrite anything typed while this request was in
               * flight — silent data loss on exactly the fast-typing path this
               * machine exists to protect. The store is already authoritative.
               */
              patch(clientId, { status: 'saved' });
            } else {
              /*
               * Serialized through ONE page-wide chain. createCard computes
               * position as max(position)+1 server-side, so two in flight at
               * once read the same max; position is not unique and listCards
               * only tie-breaks on created_at, so the cards would silently end
               * up in the wrong order — under fast typing, which is exactly
               * when cards get added.
               */
              const result = await (createQueueRef.current = createQueueRef.current.then(() =>
                actions.createCard({
                  deckId,
                  frontJson: front,
                  backJson: back,
                })
              ) as Promise<{ id?: string; errors?: { form?: string } }>);

              if (result.errors?.form || !result.id) {
                throw new Error(result.errors?.form ?? 'error.unexpected');
              }
              // The id and the status, never the content that was sent.
              patch(clientId, { serverId: result.id, status: 'saved' });

              // Deleted mid-create: now that there is an id, honour it.
              if (pendingDeleteRef.current.has(clientId)) {
                pendingDeleteRef.current.delete(clientId);
                await actions.deleteCard({ id: result.id });
                removeRow(clientId);
              }
            }
            return;
          } catch (error) {
            const code = error instanceof Error ? error.message : 'error.unexpected';
            if (attempt === 0) {
              dirtyRef.current.add(clientId);
              continue;
            }
            dirtyRef.current.add(clientId);
            patch(clientId, { status: 'error', errorCode: code });
          }
        }
      })();

      inFlightRef.current.set(clientId, run);
      try {
        await run;
      } finally {
        if (inFlightRef.current.get(clientId) === run) inFlightRef.current.delete(clientId);
      }
    },
    [actions, deckId, patch, removeRow, snapshot]
  );

  const scheduleSave = useCallback(
    (clientId: string) => {
      dirtyRef.current.add(clientId);
      const timers = timersRef.current;
      const existing = timers.get(clientId);
      if (existing) clearTimeout(existing);
      timers.set(
        clientId,
        setTimeout(() => {
          timers.delete(clientId);
          void persist(clientId);
        }, AUTOSAVE_MS)
      );
    },
    [persist]
  );

  /** Flush now, skipping the debounce. Used on blur, Escape and ⌘S. */
  const saveNow = useCallback(
    (clientId: string) => {
      const timer = timersRef.current.get(clientId);
      if (timer) {
        clearTimeout(timer);
        timersRef.current.delete(clientId);
      }
      return persist(clientId);
    },
    [persist]
  );

  const setDoc = useCallback(
    (clientId: string, side: 'front' | 'back', doc: NoteDoc) => {
      patch(clientId, { [side]: doc } as Partial<CardRowState>);
      scheduleSave(clientId);
    },
    [patch, scheduleSave]
  );

  /** Append a draft synchronously and return it, so Tab never waits on a request. */
  const appendRow = useCallback((): CardRowState => {
    const row = draftRow();
    listRef.current = [...listRef.current, row];
    commit();
    return row;
  }, [commit]);

  const deleteRow = useCallback(
    async (clientId: string) => {
      const row = listRef.current.find((candidate) => candidate.clientId === clientId);
      if (!row) return;

      const timer = timersRef.current.get(clientId);
      if (timer) clearTimeout(timer);
      timersRef.current.delete(clientId);
      dirtyRef.current.delete(clientId);

      if (!row.serverId) {
        // Never created: if a create is in flight, mark it so the id gets
        // deleted the moment it lands; otherwise just drop it locally.
        if (inFlightRef.current.has(clientId)) {
          pendingDeleteRef.current.add(clientId);
          return;
        }
        removeRow(clientId);
        return;
      }

      const result = await actions.deleteCard({ id: row.serverId });
      if (result.errors?.form) {
        patch(clientId, { status: 'error', errorCode: result.errors.form });
        return;
      }
      removeRow(clientId);
    },
    [actions, patch, removeRow]
  );

  /*
   * One pair of listeners for the page, not one per row. Reconnecting flushes
   * every dirty row.
   */
  useEffect(() => {
    const flush = () => {
      for (const clientId of Array.from(dirtyRef.current)) void persist(clientId);
    };
    const markOffline = () => {
      for (const clientId of Array.from(dirtyRef.current)) {
        patch(clientId, { status: 'offline' });
      }
    };
    window.addEventListener('online', flush);
    window.addEventListener('offline', markOffline);
    return () => {
      window.removeEventListener('online', flush);
      window.removeEventListener('offline', markOffline);
    };
  }, [patch, persist]);

  /*
   * Unmount flush. Blur already flushes the row being left, so at most one row
   * is dirty here. Fired without awaiting: the action completes server-side
   * even though this component is gone.
   */
  useEffect(() => {
    const timers = timersRef.current;
    const dirty = dirtyRef.current;
    return () => {
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
      for (const clientId of Array.from(dirty)) void persist(clientId);
    };
  }, [persist]);

  return {
    rows,
    setDoc,
    appendRow,
    deleteRow,
    scheduleSave,
    saveNow,
    retry: saveNow,
  };
}
