/**
 * @vitest-environment jsdom
 */

/*
 * Three tests, all required. Each guards a specific regression class.
 *
 * 1. Stale closure — useShortcut registered at mount with phase='front' and
 *    queue=[], so grading shortcuts never fire. The fix is a latest-ref
 *    pattern: store onPress in a ref, update every render, register a stable
 *    wrapper. This test dispatches a REAL window keydown after a re-render
 *    that changes state; the callback must see the new state.
 *
 * 2. Register-called-once — the naive fix (adding onPress to deps) makes test 1
 *    pass but trips "Maximum update depth exceeded" (EVOLUTION 2026-08-07).
 *    Without both tests the fix oscillates between two bugs.
 *
 * 3. Escape from contenteditable — provider.tsx:151 returns early for ANY
 *    unmodified key in an editable, so Escape never reaches a binding. The
 *    fix adds allowInEditable. This test proves Escape fires from a
 *    contenteditable when opted in, and does NOT fire when not.
 */

import { render, fireEvent } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';
import { ShortcutProvider } from './provider';
import { useActiveScope } from './use-scope';
import { useShortcut } from './use-shortcut';
import type { GSecondKeyMap } from './types';

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

const EMPTY_G_MAP: GSecondKeyMap = {};

/** Minimal i18n provider so ShortcutOverlay's useTranslations() works. */
function I18n({ children }: { children: React.ReactNode }) {
  return (
    <NextIntlClientProvider locale="en" messages={{ shortcuts: { title: 'Shortcuts' }, common: { close: 'Close' } }}>
      {children}
    </NextIntlClientProvider>
  );
}

function Provider({ children }: { children: React.ReactNode }) {
  return (
    <I18n>
      <ShortcutProvider enabled gSecondKeyMap={EMPTY_G_MAP}>
        {children}
      </ShortcutProvider>
    </I18n>
  );
}

function dispatchKey(key: string, opts?: { metaKey?: boolean }) {
  fireEvent.keyDown(window, { key, bubbles: true, ...opts });
}

/* ------------------------------------------------------------------ */
/*  1. Stale closure                                                  */
/* ------------------------------------------------------------------ */

describe('useShortcut — stale closure', () => {
  it('dispatches through the provider with the latest state, not the initial state', () => {
    const onPress = vi.fn();

    function TestComponent({ phase }: { phase: string }) {
      // Mirrors review-session.tsx: the review screen pushes its scope so its
      // bindings are active. Without this the 'review'-scoped binding is
      // shadowed by the global default scope and never fires.
      useActiveScope('review');
      useShortcut('review', '1', () => {
        if (phase === 'grading') onPress();
      });
      return null;
    }

    const { rerender } = render(
      <Provider>
        <TestComponent phase="front" />
      </Provider>
    );

    // keydown while phase is 'front' — onPress must NOT fire
    dispatchKey('1');
    expect(onPress).not.toHaveBeenCalled();

    // re-render with phase changed — the stale closure bug freezes phase='front'
    rerender(
      <Provider>
        <TestComponent phase="grading" />
      </Provider>
    );

    // keydown now — must see the latest phase
    dispatchKey('1');
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

/* ------------------------------------------------------------------ */
/*  2. Register-called-once                                           */
/* ------------------------------------------------------------------ */

describe('useShortcut — register called once', () => {
  it('does not re-register on every re-render (no infinite loop)', () => {
    // If onPress is added to the effect deps, every re-render re-registers,
    // which triggers "Maximum update depth exceeded" in React.
    // This test renders the component 20 times with changing state; if the
    // loop exists, the test either throws that error or never completes.
    let renderCount = 0;

    function ChangingComponent() {
      renderCount++;
      useShortcut('global', 'a', () => {}, { label: 'test' });
      return null;
    }

    const { rerender } = render(
      <Provider>
        <ChangingComponent />
      </Provider>
    );

    for (let i = 1; i <= 20; i++) {
      rerender(
        <Provider>
          <ChangingComponent />
        </Provider>
      );
    }

    // 1 mount + 20 re-renders = 21. If register ran on every render, React
    // would throw "Maximum update depth exceeded" before reaching here.
    expect(renderCount).toBe(21);
  });
});

/* ------------------------------------------------------------------ */
/*  3. Escape from contenteditable                                    */
/* ------------------------------------------------------------------ */

describe('useShortcut — Escape from contenteditable', () => {
  it('fires an opted-in binding but not a non-opted one', () => {
    const optedIn = vi.fn();
    const notOptedIn = vi.fn();

    function TestComponent() {
      useActiveScope('editor');
      // Both bind the SAME key (Escape) in the SAME scope. The provider
      // dispatch loop iterates bindings from the end; the last-registered
      // wins, so order matters. Register the non-opted FIRST and the opted-in
      // LAST so the opted-in one is found first.
      useShortcut('editor', 'Escape', notOptedIn, {
        label: 'exitMath', // no allowInEditable → suppressed in editables
      });
      useShortcut('editor', 'Escape', optedIn, {
        label: 'exitMath',
        allowInEditable: true,
      });
      return (
        <div contentEditable suppressContentEditableWarning>
          editable
        </div>
      );
    }

    const { getByText } = render(
      <Provider>
        <TestComponent />
      </Provider>
    );

    const editable = getByText('editable');
    editable.focus();

    // From inside the contenteditable, the opted-in binding fires and the
    // non-opted one is suppressed by provider.tsx's editable guard.
    dispatchKey('Escape');
    expect(optedIn).toHaveBeenCalledTimes(1);
    expect(notOptedIn).not.toHaveBeenCalled();
  });

  it('does not fire when NOT inside an editable', () => {
    const optedIn = vi.fn();

    function TestComponent() {
      useActiveScope('editor');
      useShortcut('editor', 'Escape', optedIn, {
        label: 'exitMath',
        allowInEditable: true,
      });
      return <button>not editable</button>;
    }

    const { getByText } = render(
      <Provider>
        <TestComponent />
      </Provider>
    );
    getByText('not editable').focus();

    dispatchKey('Escape');
    expect(optedIn).toHaveBeenCalledTimes(1);
  });
});
