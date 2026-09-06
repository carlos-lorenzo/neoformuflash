// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { useCallback, useMemo, useRef, useState } from 'react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import messages from '@/messages/en.json';
import { ShortcutContext, type ShortcutContextValue } from '@/lib/shortcuts/provider';
import type { Binding } from '@/lib/shortcuts/types';
import { MultiCardEditor } from './multi-card-editor';

/*
 * The regression this file exists for.
 *
 * The shortcut dispatcher fires only the LAST-registered match for a key, so a
 * page that lets every row register ⌘M leaves all but one of them dead. With
 * 2×N MathEditorFields on screen that is a silent, scale-dependent failure —
 * it works with one card and breaks with two.
 *
 * BOTH assertions here are mandatory together, and specs/EVOLUTION.md
 * (2026-08-08) explains why: fixing the stale-closure half of useShortcut on
 * its own reintroduces the 2026-08-07 "Maximum update depth exceeded" loop,
 * and each bug makes the other's test pass. So this asserts the binding COUNT
 * does not grow with rows, and that register is not called repeatedly.
 */

vi.mock('@/app/app/decks/actions', () => ({
  createCard: vi.fn(async () => ({ id: 'srv-new' })),
  updateCard: vi.fn(async () => ({ savedAt: 'now' })),
  deleteCard: vi.fn(async () => ({})),
}));

const EMPTY = { type: 'doc' as const, content: [] };

const seeds = (count: number) =>
  Array.from({ length: count }, (_, index) => ({
    id: `card-${index}`,
    frontJson: EMPTY,
    backJson: EMPTY,
  }));

beforeAll(() => {
  const rect = {
    top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0, x: 0, y: 0,
    toJSON: () => ({}),
  } as DOMRect;
  const rects = Object.assign([rect], { item: () => rect }) as unknown as DOMRectList;
  for (const proto of [Element.prototype, Range.prototype]) {
    Object.defineProperty(proto, 'getClientRects', { configurable: true, value: () => rects });
    Object.defineProperty(proto, 'getBoundingClientRect', { configurable: true, value: () => rect });
  }
  // The editor is read-only below 768px, so the grid renders only at tablet+.
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (query: string) => ({
      matches: true,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  });
  Object.defineProperty(window, 'IntersectionObserver', {
    configurable: true,
    value: class {
      observe() {}
      disconnect() {}
    },
  });
});

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

/** A real-shaped provider that records every register/unregister call. */
type Spy = {
  register: ReturnType<typeof vi.fn<(binding: Binding) => void>>;
  unregister: ReturnType<typeof vi.fn<(id: string) => void>>;
};

function RecordingProvider({ children, spy }: { children: React.ReactNode; spy: Spy }) {
  const bindingsRef = useRef(new Map<string, Binding>());
  const [, force] = useState(0);

  const register = useCallback(
    (binding: Binding) => {
      spy.register(binding);
      bindingsRef.current.set(binding.id, binding);
    },
    [spy]
  );
  const unregister = useCallback(
    (id: string) => {
      spy.unregister(id);
      bindingsRef.current.delete(id);
    },
    [spy]
  );

  const value = useMemo<ShortcutContextValue>(
    () => ({
      register,
      unregister,
      // Rebuilt on every scope change in the real provider — that churn is
      // what made consumers depending on the context OBJECT loop forever.
      pushScope: () => force((n) => n + 1),
      popScope: () => force((n) => n + 1),
      activeScopes: ['editor'],
      gPending: false,
      getBindings: () => Array.from(bindingsRef.current.values()),
      openOverlay: () => {},
    }),
    [register, unregister]
  );

  return <ShortcutContext.Provider value={value}>{children}</ShortcutContext.Provider>;
}

function mount(cardCount: number) {
  const spy: Spy = {
    register: vi.fn<(binding: Binding) => void>(),
    unregister: vi.fn<(id: string) => void>(),
  };
  const utils = render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <RecordingProvider spy={spy}>
        <MultiCardEditor deckId="deck-1" initialCards={seeds(cardCount)} />
      </RecordingProvider>
    </NextIntlClientProvider>
  );
  return { ...utils, spy };
}

const keysRegistered = (spy: Spy) => spy.register.mock.calls.map((call) => call[0].keys);

describe('MultiCardEditor — one registration per binding, whatever the row count', () => {
  it('registers mod+M exactly once with a single card', async () => {
    const { spy } = mount(1);
    await waitFor(() => expect(spy.register).toHaveBeenCalled());
    expect(keysRegistered(spy).filter((k) => k === 'mod+m')).toHaveLength(1);
  });

  it('STILL registers mod+M exactly once with fifty cards', async () => {
    // The whole point: the count must not scale with rows.
    const { spy } = mount(50);
    await waitFor(() => expect(spy.register).toHaveBeenCalled());
    expect(keysRegistered(spy).filter((k) => k === 'mod+m')).toHaveLength(1);
    expect(keysRegistered(spy).filter((k) => k === 'mod+shift+m')).toHaveLength(1);
    expect(keysRegistered(spy).filter((k) => k === 'Escape')).toHaveLength(1);
  });

  it('does not re-register on re-render — the infinite-loop guard', async () => {
    /*
     * If the bindings were re-registered whenever the provider rebuilt its
     * context object, this count would climb and the real provider would trip
     * "Maximum update depth exceeded" (EVOLUTION 2026-08-07).
     */
    const { spy, rerender } = mount(3);
    await waitFor(() => expect(spy.register).toHaveBeenCalled());
    const initial = spy.register.mock.calls.length;

    rerender(
      <NextIntlClientProvider locale="en" messages={messages}>
        <RecordingProvider spy={spy}>
          <MultiCardEditor deckId="deck-1" initialCards={seeds(3)} />
        </RecordingProvider>
      </NextIntlClientProvider>
    );

    expect(spy.register.mock.calls.length).toBe(initial);
  });

  it('mounts NO ProseMirror editors until a row is activated', async () => {
    // 200 cards would otherwise be 400 live editors on one page.
    const { container } = mount(20);
    await waitFor(() => expect(screen.getAllByRole('listitem').length).toBeGreaterThan(0));
    expect(container.querySelectorAll('.ProseMirror')).toHaveLength(0);
  });
});
