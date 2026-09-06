// @vitest-environment jsdom

import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NoteDoc } from '@neoformuflash/contracts';
import {
  useCardRows,
  AUTOSAVE_MS,
  EMPTY_DOC,
  type CardActions,
  type CardRowSeed,
} from './use-card-rows';

/*
 * The two bugs this machine exists to prevent are both invisible in the DOM
 * and only appear under speed:
 *
 *   - two concurrent createCard calls read the same max(position)+1, so cards
 *     land out of order;
 *   - a save issued while a create is in flight either creates a duplicate or
 *     loses the keystrokes.
 *
 * specs/EVOLUTION.md records five incidents of this codebase shipping a green
 * suite over exactly this kind of hole, so these are asserted directly rather
 * than through the UI.
 */

const doc = (text: string): NoteDoc => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
});

/** vitest's Mock view of an action, for asserting call arguments. */
const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>;

function makeActions(overrides: Partial<CardActions> = {}) {
  let created = 0;
  const calls = { create: [] as unknown[], update: [] as unknown[], del: [] as unknown[] };
  const actions: CardActions = {
    createCard: vi.fn(async (input) => {
      calls.create.push(input);
      created += 1;
      return { id: `srv-${created}` };
    }),
    updateCard: vi.fn(async (input) => {
      calls.update.push(input);
      return { savedAt: new Date().toISOString() };
    }),
    deleteCard: vi.fn(async (input) => {
      calls.del.push(input);
      return {};
    }),
    ...overrides,
  };
  return { actions, calls };
}

/*
 * A distinct deck per test. useCardRows keeps a module-level cache of rows so
 * they survive the remount a completed Server Action causes, and a shared deck
 * id would let one test's rows leak into the next — which is also exactly what
 * would happen in the app if two decks shared an id.
 */
let deckCounter = 0;

function setup(actions: CardActions, initial: Parameters<typeof useCardRows>[0]['initial'] = []) {
  deckCounter += 1;
  const deckId = `deck-${deckCounter}`;
  return renderHook(() => useCardRows({ deckId, initial, actions }));
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true, writable: true });
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

describe('autosave debounce', () => {
  it('saves once after the LAST change, not once per keystroke', async () => {
    const { actions } = makeActions();
    const { result } = setup(actions, [
      { id: 'c1', frontJson: EMPTY_DOC, backJson: EMPTY_DOC },
    ]);
    const id = result.current.rows[0]!.clientId;

    act(() => {
      result.current.setDoc(id, 'front', doc('a'));
      result.current.setDoc(id, 'front', doc('ab'));
      result.current.setDoc(id, 'front', doc('abc'));
    });

    expect(actions.updateCard).not.toHaveBeenCalled();
    await act(async () => {
      vi.advanceTimersByTime(AUTOSAVE_MS + 10);
    });

    await waitFor(() => expect(actions.updateCard).toHaveBeenCalledTimes(1));
    expect(JSON.stringify(asMock(actions.updateCard).mock.calls[0]![0])).toContain('abc');
  });

  it('saveNow bypasses the debounce entirely', async () => {
    const { actions } = makeActions();
    const { result } = setup(actions, [
      { id: 'c1', frontJson: EMPTY_DOC, backJson: EMPTY_DOC },
    ]);
    const id = result.current.rows[0]!.clientId;

    act(() => result.current.setDoc(id, 'front', doc('now')));
    await act(async () => {
      await result.current.saveNow(id);
    });

    expect(actions.updateCard).toHaveBeenCalledTimes(1);
  });
});

describe('draft creation', () => {
  it('appends synchronously, without waiting on a request', () => {
    const { actions } = makeActions();
    const { result } = setup(actions);

    act(() => {
      result.current.appendRow();
    });
    expect(result.current.rows).toHaveLength(1);
    expect(result.current.rows[0]!.serverId).toBeNull();
    // Tab must never block on the network.
    expect(actions.createCard).not.toHaveBeenCalled();
  });

  it('NEVER posts a draft that is still blank', async () => {
    // Overshooting Tab past the last card has to be free, or the deck fills up
    // with empty cards nobody asked for.
    const { actions } = makeActions();
    const { result } = setup(actions);

    act(() => {
      result.current.appendRow();
    });
    const id = result.current.rows[0]!.clientId;

    await act(async () => {
      await result.current.saveNow(id);
    });
    expect(actions.createCard).not.toHaveBeenCalled();
  });

  it('creates exactly once even when two saves are scheduled', async () => {
    const { actions } = makeActions();
    const { result } = setup(actions);

    act(() => {
      result.current.appendRow();
    });
    const id = result.current.rows[0]!.clientId;

    await act(async () => {
      act(() => result.current.setDoc(id, 'front', doc('x')));
      const a = result.current.saveNow(id);
      const b = result.current.saveNow(id);
      await Promise.all([a, b]);
    });

    expect(actions.createCard).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(result.current.rows[0]!.serverId).toBe('srv-1'));
  });

  it('serializes creates so three fast rows land in typed order', async () => {
    /*
     * THE position race. createCard computes max(position)+1 server-side; two
     * in flight at once read the same max. Resolution order is randomised here
     * so a parallel implementation cannot pass by luck.
     */
    const order: string[] = [];
    let inFlight = 0;
    let maxConcurrent = 0;

    const { actions } = makeActions({
      createCard: vi.fn(async (input) => {
        inFlight += 1;
        maxConcurrent = Math.max(maxConcurrent, inFlight);
        const text = JSON.stringify(input.frontJson);
        await new Promise((r) => setTimeout(r, text.includes('one') ? 30 : 1));
        inFlight -= 1;
        order.push(text);
        return { id: `srv-${order.length}` };
      }),
    });

    const { result } = setup(actions);

    await act(async () => {
      for (const text of ['one', 'two', 'three']) {
        let clientId = '';
        act(() => {
          clientId = result.current.appendRow().clientId;
        });
        act(() => result.current.setDoc(clientId, 'front', doc(text)));
        void result.current.saveNow(clientId);
      }
      await vi.advanceTimersByTimeAsync(500);
    });

    await waitFor(() => expect(order).toHaveLength(3));
    // Never more than one create on the wire at a time...
    expect(maxConcurrent).toBe(1);
    // ...and they committed in the order the student typed, despite the first
    // one being the slowest.
    expect(order.map((o) => JSON.parse(o).content[0].content[0].text)).toEqual([
      'one',
      'two',
      'three',
    ]);
  });

  it('a keystroke during an in-flight create becomes an update, not a second create', async () => {
    let release: (() => void) | null = null;
    const { actions } = makeActions({
      createCard: vi.fn(async () => {
        await new Promise<void>((r) => {
          release = r;
        });
        return { id: 'srv-1' };
      }),
    });

    const { result } = setup(actions);
    act(() => {
      result.current.appendRow();
    });
    const id = result.current.rows[0]!.clientId;

    act(() => result.current.setDoc(id, 'front', doc('first')));
    let firstSave: Promise<void>;
    act(() => {
      firstSave = result.current.saveNow(id);
    });
    await waitFor(() => expect(actions.createCard).toHaveBeenCalledTimes(1));

    // Type again while the create is still open.
    act(() => result.current.setDoc(id, 'front', doc('second')));
    let secondSave: Promise<void>;
    act(() => {
      secondSave = result.current.saveNow(id);
    });

    await act(async () => {
      release!();
      await Promise.all([firstSave!, secondSave!]);
    });

    expect(actions.createCard).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(actions.updateCard).toHaveBeenCalledTimes(1));
    expect(JSON.stringify(asMock(actions.updateCard).mock.calls[0]![0])).toContain('second');
  });
});

describe('failure handling', () => {
  it('retries once automatically, then surfaces the error', async () => {
    const updateCard = vi
      .fn()
      .mockResolvedValueOnce({ errors: { form: 'error.unexpected' } })
      .mockResolvedValueOnce({ errors: { form: 'error.unexpected' } });
    const { actions } = makeActions({ updateCard });

    const { result } = setup(actions, [
      { id: 'c1', frontJson: EMPTY_DOC, backJson: EMPTY_DOC },
    ]);
    const id = result.current.rows[0]!.clientId;

    act(() => result.current.setDoc(id, 'front', doc('x')));
    await act(async () => {
      await result.current.saveNow(id);
    });

    // One user-invisible retry, then it stops and asks.
    expect(updateCard).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(result.current.rows[0]!.status).toBe('error'));
    expect(result.current.rows[0]!.errorCode).toBe('error.unexpected');
  });

  it('treats a rejected promise the same as a returned error', async () => {
    // A network abort and a validation failure must not leave the row stuck
    // on "saving" forever.
    const updateCard = vi.fn().mockRejectedValue(new Error('boom'));
    const { actions } = makeActions({ updateCard });

    const { result } = setup(actions, [
      { id: 'c1', frontJson: EMPTY_DOC, backJson: EMPTY_DOC },
    ]);
    const id = result.current.rows[0]!.clientId;

    act(() => result.current.setDoc(id, 'front', doc('x')));
    await act(async () => {
      await result.current.saveNow(id);
    });

    await waitFor(() => expect(result.current.rows[0]!.status).toBe('error'));
  });

  it('goes offline without a request, and flushes on reconnect', async () => {
    const { actions } = makeActions();
    const { result } = setup(actions, [
      { id: 'c1', frontJson: EMPTY_DOC, backJson: EMPTY_DOC },
    ]);
    const id = result.current.rows[0]!.clientId;

    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    act(() => result.current.setDoc(id, 'front', doc('offline edit')));
    await act(async () => {
      await result.current.saveNow(id);
    });

    expect(actions.updateCard).not.toHaveBeenCalled();
    await waitFor(() => expect(result.current.rows[0]!.status).toBe('offline'));

    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    await act(async () => {
      window.dispatchEvent(new Event('online'));
      await vi.advanceTimersByTimeAsync(50);
    });

    await waitFor(() => expect(actions.updateCard).toHaveBeenCalledTimes(1));
  });
});

describe('delete', () => {
  it('drops an uncreated draft with no request at all', async () => {
    const { actions } = makeActions();
    const { result } = setup(actions);
    act(() => {
      result.current.appendRow();
    });
    const id = result.current.rows[0]!.clientId;

    await act(async () => {
      await result.current.deleteRow(id);
    });

    expect(result.current.rows).toHaveLength(0);
    expect(actions.deleteCard).not.toHaveBeenCalled();
  });

  it('deletes a created row and removes it', async () => {
    const { actions } = makeActions();
    const { result } = setup(actions, [
      { id: 'c1', frontJson: EMPTY_DOC, backJson: EMPTY_DOC },
    ]);
    const id = result.current.rows[0]!.clientId;

    await act(async () => {
      await result.current.deleteRow(id);
    });

    expect(actions.deleteCard).toHaveBeenCalledWith({ id: 'c1' });
    expect(result.current.rows).toHaveLength(0);
  });

  it('surfaces card.hasSubscribers and KEEPS the row', async () => {
    // A BEFORE DELETE trigger blocks deleting a card other users have
    // card_states for. Removing the row locally would tell the student a lie.
    const { actions } = makeActions({
      deleteCard: vi.fn(async () => ({ errors: { form: 'card.hasSubscribers' } })),
    });
    const { result } = setup(actions, [
      { id: 'c1', frontJson: EMPTY_DOC, backJson: EMPTY_DOC },
    ]);
    const id = result.current.rows[0]!.clientId;

    await act(async () => {
      await result.current.deleteRow(id);
    });

    expect(result.current.rows).toHaveLength(1);
    expect(result.current.rows[0]!.errorCode).toBe('card.hasSubscribers');
  });
});

describe('surviving the remount a Server Action causes', () => {
  /*
   * Completing a Server Action makes Next re-render the route, and that
   * re-render remounts this hook's component: the mount effect fires twice and
   * useState re-runs its initializer with whatever listCards returned.
   *
   * Verified in a browser, not assumed. The visible symptom was that tabbing
   * past the last card produced a new row which vanished a moment later, when
   * the previous row's autosave landed — and it read as a Tab bug.
   */
  function mount(actions: CardActions, deckId: string, initial: CardRowSeed[]) {
    return renderHook(() => useCardRows({ deckId, initial, actions }));
  }

  const seeded = (id: string): CardRowSeed => ({
    id,
    frontJson: EMPTY_DOC,
    backJson: EMPTY_DOC,
  });

  it('carries an uncreated draft across the remount', () => {
    const { actions } = makeActions();
    const deckId = `remount-draft-${Date.now()}`;

    const first = mount(actions, deckId, [seeded('c1')]);
    act(() => {
      first.result.current.appendRow();
    });
    expect(first.result.current.rows).toHaveLength(2);
    first.unmount();

    // The server still knows about one card; the draft was never posted.
    const second = mount(actions, deckId, [seeded('c1')]);
    expect(second.result.current.rows).toHaveLength(2);
    expect(second.result.current.rows[1]!.serverId).toBeNull();
  });

  it('takes the server content for a clean row, keeping its identity', () => {
    // A stale cache must not shadow newer content — an edit made elsewhere has
    // to win over a row this tab has nothing outstanding on.
    const { actions } = makeActions();
    const deckId = `remount-clean-${Date.now()}`;

    const first = mount(actions, deckId, [seeded('c1')]);
    const clientId = first.result.current.rows[0]!.clientId;
    first.unmount();

    const updated: CardRowSeed = { ...seeded('c1'), frontJson: doc('changed elsewhere') };
    const second = mount(actions, deckId, [updated]);

    expect(JSON.stringify(second.result.current.rows[0]!.front)).toContain('changed elsewhere');
    // Same row, so live editors and pending saves stay attached to it.
    expect(second.result.current.rows[0]!.clientId).toBe(clientId);
  });

  it('keeps a row that still has unsaved work', async () => {
    const { actions } = makeActions({
      updateCard: vi.fn(async () => ({ errors: { form: 'error.unexpected' } })),
    });
    const deckId = `remount-dirty-${Date.now()}`;

    const first = mount(actions, deckId, [seeded('c1')]);
    const id = first.result.current.rows[0]!.clientId;

    act(() => first.result.current.setDoc(id, 'front', doc('unsaved edit')));
    await act(async () => {
      await first.result.current.saveNow(id);
    });
    // Both attempts, the automatic retry included, have to land before the row
    // counts as having unsaved work.
    await waitFor(() => expect(actions.updateCard).toHaveBeenCalledTimes(2));
    expect(first.result.current.rows[0]!.status).not.toBe('idle');
    expect(first.result.current.rows[0]!.status).not.toBe('saved');
    first.unmount();

    // The server never accepted it, so the local copy is the only one that has
    // the student's typing.
    const second = mount(actions, deckId, [seeded('c1')]);
    // The server never accepted the edit, so the local copy is the only one
    // holding what the student typed. Losing it here is silent data loss.
    expect(JSON.stringify(second.result.current.rows[0]!.front)).toContain('unsaved edit');
  });
});
