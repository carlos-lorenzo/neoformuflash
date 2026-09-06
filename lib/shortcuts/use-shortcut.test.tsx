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
 *
 * 4. Case-insensitive key declaration — matchesModifier lowercased the EVENT
 *    key but compared it against the raw declared string, so every binding
 *    written `'mod+M'` was dead. All eight ⌘M / ⌘⇧M registrations in the app
 *    were declared that way. It stayed invisible because MathEditorField also
 *    handles those keys at the ProseMirror level, so math kept working
 *    whenever a field had focus and the dead binding had nothing left to
 *    prove — a shortcut that is a no-op is silent by construction, which is
 *    why the matcher itself now has a test.
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

/* ------------------------------------------------------------------ */
/*  4. Modifier bindings are case-insensitive                          */
/* ------------------------------------------------------------------ */

describe('useShortcut — modifier key case', () => {
  function Harness({ keys, onPress }: { keys: string; onPress: () => void }) {
    useActiveScope('editor');
    useShortcut('editor', keys, onPress, { label: 'shortcuts.editor.inlineMath' });
    return null;
  }

  /*
   * jsdom is not a Mac, so isMac() is false and the dispatcher reads ctrlKey.
   * Sending metaKey here would make every one of these pass for the wrong
   * reason on a Mac and fail in CI.
   */
  const press = (key: string, extra: Record<string, unknown> = {}) =>
    fireEvent.keyDown(window, { key, ctrlKey: true, bubbles: true, ...extra });

  it('fires for a binding declared with a CAPITAL letter', () => {
    // The exact string all four ⌘M registrations used.
    const onPress = vi.fn();
    render(
      <Provider>
        <Harness keys="mod+M" onPress={onPress} />
      </Provider>
    );

    press('m');
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('fires for the same binding declared lowercase', () => {
    const onPress = vi.fn();
    render(
      <Provider>
        <Harness keys="mod+m" onPress={onPress} />
      </Provider>
    );

    press('m');
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('fires for a shift+modifier binding declared with a capital', () => {
    const onPress = vi.fn();
    render(
      <Provider>
        <Harness keys="mod+shift+M" onPress={onPress} />
      </Provider>
    );

    press('M', { shiftKey: true });
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('fires WITHOUT the caller passing requireModified', () => {
    /*
     * The second half of the same bug: the dispatcher ignores a binding on a
     * modified keypress unless requireModified is set, and five of the eight
     * mod+* registrations never set it. It is now derived from the key string,
     * and `Harness` deliberately does not pass the flag.
     */
    const onPress = vi.fn();
    render(
      <Provider>
        <Harness keys="mod+enter" onPress={onPress} />
      </Provider>
    );

    press('Enter');
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('does not fire without the modifier', () => {
    const onPress = vi.fn();
    render(
      <Provider>
        <Harness keys="mod+M" onPress={onPress} />
      </Provider>
    );

    fireEvent.keyDown(window, { key: 'm', bubbles: true });
    expect(onPress).not.toHaveBeenCalled();
  });
});
