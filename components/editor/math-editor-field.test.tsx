// @vitest-environment jsdom

import { cleanup, render, waitFor } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { NextIntlClientProvider } from 'next-intl';
import type { NoteDoc } from '@neoformuflash/contracts';
import messages from '@/messages/en.json';
import { MathEditorField, type MathEditorFieldHandle } from './math-editor-field';

/*
 * MathEditorField is consumed by three surfaces now — the legacy card editor,
 * the review inline-edit overlay, and the multi-card deck editor — and the
 * multi-card editor mounts it 2×N times on one page.
 *
 * The Tab props added for the multi-card editor are ADDITIVE. The test that
 * matters most here is the negative one: with no `onTabOut`, Tab must not be
 * intercepted at all, or every Tab in the review overlay and the legacy editor
 * silently changes meaning. specs/EVOLUTION.md records two separate incidents
 * of a shared editor change breaking a surface nobody re-tested.
 */

const EMPTY: NoteDoc = { type: 'doc', content: [] };

const withText = (text: string): NoteDoc => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
});

/*
 * jsdom implements no layout, so getClientRects/getBoundingClientRect are
 * missing or return zeroes. ProseMirror's coordsAtPos needs them to position
 * the equation panel. These stubs are enough for "did the panel open on the
 * right instance", which is what is under test — not where it was drawn.
 */
beforeAll(() => {
  const rect = {
    top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0, x: 0, y: 0,
    toJSON: () => ({}),
  } as DOMRect;
  const rects = Object.assign([rect], { item: () => rect }) as unknown as DOMRectList;

  for (const proto of [Element.prototype, Range.prototype]) {
    Object.defineProperty(proto, 'getClientRects', {
      configurable: true,
      value: () => rects,
    });
    Object.defineProperty(proto, 'getBoundingClientRect', {
      configurable: true,
      value: () => rect,
    });
  }
});

afterEach(cleanup);

/*
 * The MathInput panel calls useTranslations, so opening one outside a provider
 * throws. Every render goes through this wrapper rather than only the tests
 * that open a panel — a test that crashes the moment a panel appears is a trap
 * for whoever adds the next assertion.
 */
function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <NextIntlClientProvider locale="en" messages={messages}>
      {children}
    </NextIntlClientProvider>
  );
}

const mount = (ui: React.ReactElement) => render(ui, { wrapper: Wrapper });

/** Resolve once the ProseMirror view exists and the handle is wired. */
async function mounted(ref: React.RefObject<MathEditorFieldHandle | null>) {
  await waitFor(() => expect(ref.current).not.toBeNull());
  await waitFor(() => expect(ref.current?.getDoc()).toBeDefined());
}

function dispatchTab(container: HTMLElement, shiftKey = false): boolean {
  const pm = container.querySelector('.ProseMirror');
  expect(pm).not.toBeNull();
  const event = new KeyboardEvent('keydown', {
    key: 'Tab',
    shiftKey,
    bubbles: true,
    cancelable: true,
  });
  pm!.dispatchEvent(event);
  return event.defaultPrevented;
}

describe('MathEditorField — Tab is opt-in', () => {
  it('does NOT intercept Tab when onTabOut is omitted', async () => {
    // The guard for inline-edit-overlay.tsx and the legacy CardEditor, which
    // pass no onTabOut and must keep native focus traversal.
    const ref = createRef<MathEditorFieldHandle>();
    const { container } = mount(
      <MathEditorField ref={ref} content={EMPTY} onChange={() => {}} placeholder="p" />
    );
    await mounted(ref);

    expect(dispatchTab(container)).toBe(false);
  });

  it('consumes Tab when onTabOut returns true, and reports the direction', async () => {
    const ref = createRef<MathEditorFieldHandle>();
    const onTabOut = vi.fn().mockReturnValue(true);
    const { container } = mount(
      <MathEditorField
        ref={ref}
        content={EMPTY}
        onChange={() => {}}
        placeholder="p"
        onTabOut={onTabOut}
      />
    );
    await mounted(ref);

    expect(dispatchTab(container, false)).toBe(true);
    expect(onTabOut).toHaveBeenLastCalledWith('forward');

    expect(dispatchTab(container, true)).toBe(true);
    expect(onTabOut).toHaveBeenLastCalledWith('backward');
  });

  it('lets Tab fall through when onTabOut returns false', async () => {
    // Shift+Tab out of the very first field must reach the browser so focus
    // leaves the grid instead of being swallowed.
    const ref = createRef<MathEditorFieldHandle>();
    const onTabOut = vi.fn().mockReturnValue(false);
    const { container } = mount(
      <MathEditorField
        ref={ref}
        content={EMPTY}
        onChange={() => {}}
        placeholder="p"
        onTabOut={onTabOut}
      />
    );
    await mounted(ref);

    expect(dispatchTab(container, true)).toBe(false);
    expect(onTabOut).toHaveBeenCalledWith('backward');
  });

  it('sees the latest onTabOut without rebuilding the editor', async () => {
    // The callback is read through a ref; putting it in useEditor's deps would
    // tear down the ProseMirror view on every parent render.
    const ref = createRef<MathEditorFieldHandle>();
    const first = vi.fn().mockReturnValue(true);
    const second = vi.fn().mockReturnValue(true);

    const { container, rerender } = mount(
      <MathEditorField
        ref={ref}
        content={EMPTY}
        onChange={() => {}}
        placeholder="p"
        onTabOut={first}
      />
    );
    await mounted(ref);
    const view = container.querySelector('.ProseMirror');

    rerender(
      <MathEditorField
        ref={ref}
        content={EMPTY}
        onChange={() => {}}
        placeholder="p"
        onTabOut={second}
      />
    );

    dispatchTab(container);
    expect(second).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
    // Same DOM node: the view was never rebuilt.
    expect(container.querySelector('.ProseMirror')).toBe(view);
  });
});

describe('MathEditorField — per-instance state', () => {
  it('keeps two simultaneously mounted fields independent', async () => {
    /*
     * The trap this component's own header warns about: note-editor.tsx uses
     * module-level singletons, which works only because exactly one of it ever
     * mounts. The multi-card editor mounts 2×N of these, so a singleton would
     * open the front card's equation panel over the back one.
     */
    const front = createRef<MathEditorFieldHandle>();
    const back = createRef<MathEditorFieldHandle>();

    mount(
      <>
        <MathEditorField ref={front} content={withText('FRONT')} onChange={() => {}} placeholder="f" />
        <MathEditorField ref={back} content={withText('BACK')} onChange={() => {}} placeholder="b" />
      </>
    );
    await mounted(front);
    await mounted(back);

    expect(JSON.stringify(front.current?.getDoc())).toContain('FRONT');
    expect(JSON.stringify(back.current?.getDoc())).toContain('BACK');

    expect(front.current?.hasOpenMathPanel()).toBe(false);
    expect(back.current?.hasOpenMathPanel()).toBe(false);

    front.current?.openInlineMath();
    await waitFor(() => expect(front.current?.hasOpenMathPanel()).toBe(true));
    // The other field's panel must stay shut.
    expect(back.current?.hasOpenMathPanel()).toBe(false);
  });

  it('reports emptiness, which is what stops a blank draft card being saved', async () => {
    const empty = createRef<MathEditorFieldHandle>();
    const filled = createRef<MathEditorFieldHandle>();

    mount(
      <>
        <MathEditorField ref={empty} content={EMPTY} onChange={() => {}} placeholder="e" />
        <MathEditorField ref={filled} content={withText('x')} onChange={() => {}} placeholder="f" />
      </>
    );
    await mounted(empty);
    await mounted(filled);

    expect(empty.current?.isEmpty()).toBe(true);
    expect(filled.current?.isEmpty()).toBe(false);
  });

  it('getDoc() bypasses the onChange debounce', async () => {
    /*
     * Save reads the ProseMirror instance directly. If it read the debounced
     * value instead, ⌘Enter issued within the debounce window would persist
     * stale content — silent data loss, and only under fast typing.
     */
    const ref = createRef<MathEditorFieldHandle>();
    const onChange = vi.fn();
    mount(
      <MathEditorField ref={ref} content={withText('typed')} onChange={onChange} placeholder="p" />
    );
    await mounted(ref);

    expect(JSON.stringify(ref.current?.getDoc())).toContain('typed');
    // No debounce has fired yet, and getDoc still saw the content.
    expect(onChange).not.toHaveBeenCalled();
  });
});
