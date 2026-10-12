// Client: Word-like math box for entering/editing LaTeX.
// Opened by typing $ (inline) or $$ on an empty line (display).
//
// The editable surface IS the rendered equation (MathLive <math-field>):
// typing \alpha, ^, _, / converts to visual symbols inline, and the caret
// can be clicked/dragged anywhere — no separate raw-text line to scroll for
// long equations. Enter commits the LaTeX, Esc cancels. Invalid LaTeX is
// shown in --danger and never commits (AC5).
//
// MathLive loads via dynamic import so SSR and jsdom (unit tests) never
// execute it: until it registers, a plain input + KaTeX preview fallback
// renders — the same UI this component used before.

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import katex from 'katex';
import { cn } from '@/lib/cn';
import type { MathfieldElement } from 'mathlive';

declare module 'react' {
  // The <math-field> custom element, registered by the dynamic `mathlive`
  // import below. Attributes use kebab-case per the MathLive API.
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      'math-field': {
        ref?: (el: MathfieldElement | null) => void;
        placeholder?: string;
        'smart-mode'?: boolean;
        'smart-fence'?: boolean;
        'smart-superscript'?: boolean;
        style?: React.CSSProperties;
      };
    }
  }
}

type MathInputProps = {
  mode: 'inline' | 'display';
  initialLatex?: string;
  position: { top: number; left: number };
  onCommit: (latex: string) => void;
  onCancel: () => void;
};

// i18n-exempt — "LaTeX" is a proper noun, not translated
const LATEX_PLACEHOLDER = 'LaTeX';

const RECENT_KEY = 'mathlive-recent';
const RECENT_MAX = 8;

type PaletteEntry = { label: string; insert: string };

const PALETTE: Record<string, PaletteEntry[]> = {
  greek: [
    { label: 'α', insert: '\\alpha' },
    { label: 'β', insert: '\\beta' },
    { label: 'γ', insert: '\\gamma' },
    { label: 'δ', insert: '\\delta' },
    { label: 'π', insert: '\\pi' },
    { label: 'θ', insert: '\\theta' },
    { label: 'λ', insert: '\\lambda' },
    { label: 'μ', insert: '\\mu' },
  ],
  operators: [
    { label: '±', insert: '\\pm' },
    { label: '×', insert: '\\times' },
    { label: '÷', insert: '\\div' },
    { label: '·', insert: '\\cdot' },
    { label: '√', insert: '\\sqrt{#0}' },
    { label: 'ⁿ√', insert: '\\sqrt[#0]{#1}' },
  ],
  relations: [
    { label: '=', insert: '=' },
    { label: '≠', insert: '\\ne' },
    { label: '≤', insert: '\\le' },
    { label: '≥', insert: '\\ge' },
    { label: '≈', insert: '\\approx' },
    { label: '∝', insert: '\\propto' },
  ],
  arrows: [
    { label: '→', insert: '\\to' },
    { label: '←', insert: '\\gets' },
    { label: '⇒', insert: '\\Rightarrow' },
    { label: '⇔', insert: '\\Leftrightarrow' },
  ],
  sets: [
    { label: '∈', insert: '\\in' },
    { label: '∉', insert: '\\notin' },
    { label: '⊂', insert: '\\subset' },
    { label: '∪', insert: '\\cup' },
    { label: '∩', insert: '\\cap' },
    { label: '∞', insert: '\\infty' },
  ],
  calculus: [
    { label: '∫', insert: '\\int' },
    { label: '∑', insert: '\\sum' },
    { label: '∏', insert: '\\prod' },
    { label: '∂', insert: '\\partial' },
    { label: '∇', insert: '\\nabla' },
    { label: 'lim', insert: '\\lim' },
  ],
  formatting: [
    { label: 'a⁄b', insert: '\\frac{#0}{#1}' },
    { label: 'xⁿ', insert: '^{#0}' },
    { label: 'xₙ', insert: '_{#0}' },
    { label: '( )', insert: '\\left(#0\\right)' },
    { label: '[ ]', insert: '\\left[#0\\right]' },
  ],
};

function loadRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((s): s is string => typeof s === 'string').slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}

export function MathInput({ mode, initialLatex = '', position, onCommit, onCancel }: MathInputProps) {
  const t = useTranslations('math');
  const tc = useTranslations('common');
  const [latex, setLatex] = useState(initialLatex);
  const [mfReady, setMfReady] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);
  const mfRef = useRef<MathfieldElement | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  /*
   * Listener-attach bookkeeping. The <math-field> ref callback below is
   * stable, and listeners attach in an effect with cleanup — so typing
   * (which re-renders on every keystroke) never detaches/re-attaches the
   * element. The previous version closed the ref callback over `commit`
   * (which changes identity per keystroke): every keystroke re-ran
   * setValue(initialLatex) and stacked another input/keydown listener, so
   * one Enter committed N duplicate math nodes.
   */
  const [mfEl, setMfEl] = useState<MathfieldElement | null>(null);
  const commitRef = useRef<() => void>(() => {});
  const cancelRef = useRef<() => void>(() => {});
  const seededRef = useRef(false);
  const initialSeed = useRef(initialLatex);

  // Register the <math-field> custom element client-side only. SSR and jsdom
  // (unit tests) keep the plain-input fallback below.
  useEffect(() => {
    let cancelled = false;
    void import('mathlive')
      .then(() => {
        if (!cancelled) {
          setRecent(loadRecent());
          setMfReady(true);
        }
      })
      .catch(() => {
        // MathLive unavailable (offline CDN fonts are lazy, but the module
        // itself is bundled) — stay on the fallback input.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Fallback input takes focus when MathLive is unavailable.
  useEffect(() => {
    if (!mfReady) inputRef.current?.focus();
  }, [mfReady]);

  // Attach Mathfield listeners exactly once per element mount, with cleanup.
  useEffect(() => {
    if (!mfReady || !mfEl) return;
    const el = mfEl;
    if (!seededRef.current) {
      seededRef.current = true;
      if (initialSeed.current) el.setValue(initialSeed.current);
    }
    el.focus();
    const onInput = () => setLatex(el.getValue());
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        commitRef.current();
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        cancelRef.current();
      }
    };
    el.addEventListener('input', onInput);
    el.addEventListener('keydown', onKeyDown as EventListener);
    return () => {
      el.removeEventListener('input', onInput);
      el.removeEventListener('keydown', onKeyDown as EventListener);
    };
  }, [mfReady, mfEl]);

  /*
   * Live validation derived during render via renderToString. Commits run
   * through the same gate, so invalid LaTeX is shown in --danger and never
   * commits (AC5). KaTeX runs with trust:false, so \href / \includegraphics
   * cannot inject markup — see note-editor.tsx KATEX_OPTIONS.
   */
  const error = useMemo(() => {
    if (!latex.trim()) return null;
    try {
      katex.renderToString(latex, {
        displayMode: mode === 'display',
        throwOnError: true,
        trust: false,
        strict: false,
      });
      return null;
    } catch {
      return t('invalidLatex');
    }
  }, [latex, mode, t]);

  const commit = useCallback(() => {
    if (!latex.trim() || error) return;
    const value = latex;
    setRecent((prev) => {
      const next = [value, ...prev.filter((s) => s !== value)].slice(0, RECENT_MAX);
      try {
        localStorage.setItem(RECENT_KEY, JSON.stringify(next));
      } catch {
        // Private mode — recent list is best-effort.
      }
      return next;
    });
    onCommit(value);
  }, [latex, error, onCommit]);

  // Keep the listener-facing callbacks fresh without re-attaching listeners.
  useEffect(() => {
    commitRef.current = commit;
    cancelRef.current = onCancel;
  });

  // Stable element handoff — no listener logic here, so ref identity never
  // changes and React never detaches/re-attaches the field mid-typing.
  const setMfRef = useCallback((el: MathfieldElement | null) => {
    mfRef.current = el;
    setMfEl(el);
  }, []);

  const insertSnippet = useCallback((snippet: string) => {
    const mf = mfRef.current;
    if (!mf) return;
    mf.insert(snippet, { insertionMode: 'replaceSelection', selectionMode: 'placeholder' });
    mf.focus();
    setLatex(mf.getValue());
  }, []);

  const handleFallbackKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        commit();
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    },
    [commit, onCancel],
  );

  return (
    <div
      className="duration-fast fixed z-50 flex flex-col gap-2 rounded-md border border-subtle bg-overlay p-3 shadow-overlay transition-opacity ease-out"
      style={{ top: position.top, left: position.left, width: 'min(560px, calc(100vw - 32px))' }}
      role="dialog"
      aria-label={mode === 'display' ? t('dialogDisplay') : t('dialogInline')}
    >
      {mfReady ? (
        <>
          {/* The Word-like box: rendered math you type into and click around.
              Long equations scroll inside the box; the box grows vertically in
              display mode instead of squeezing to one scrolled raw line. */}
          <math-field
            ref={setMfRef}
            placeholder={LATEX_PLACEHOLDER}
            smart-mode
            smart-fence
            smart-superscript
            style={{
              width: '100%',
              minHeight: mode === 'display' ? '72px' : '48px',
              maxHeight: '40vh',
              overflowX: 'auto',
              overflowY: 'auto',
              fontSize: '1.2em',
              borderRadius: '8px',
              border: '1px solid var(--border-subtle)',
              background: 'var(--bg-raised)',
              padding: '8px 12px',
              color: 'var(--text-primary)',
            }}
          />
          {/* Symbol palette — pointer path for everything the keyboard does. */}
          <div className="flex flex-col gap-2">
            {recent.length > 0 && (
              <div className="flex flex-wrap items-center gap-1">
                <span className="mr-1 text-ui-xs text-tertiary">{t('recent')}</span>
                {recent.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => insertSnippet(s)}
                    className="max-w-24 truncate rounded-sm border border-subtle bg-raised px-2 py-1 font-mono text-ui-xs text-secondary transition-colors hover:bg-inset hover:text-primary"
                    title={s}
                  >
                    {s.slice(0, 24)}
                  </button>
                ))}
              </div>
            )}
            <details className="rounded-sm border border-subtle">
              <summary className="cursor-pointer select-none px-2 py-1 text-ui-xs text-tertiary">
                {t('palette')}
              </summary>
              <div className="flex max-h-24 flex-col gap-2 overflow-auto border-t border-subtle p-2">
                {(Object.keys(PALETTE) as Array<keyof typeof PALETTE>).map((cat) => (
                  <div key={cat} className="flex flex-wrap items-center gap-1">
                    <span className="w-16 shrink-0 text-ui-xs text-tertiary">
                      {t(`categories.${cat}`)}
                    </span>
                    {PALETTE[cat]!.map((entry) => (
                      <button
                        key={entry.insert}
                        type="button"
                        onClick={() => insertSnippet(entry.insert)}
                        className="min-w-8 rounded-sm border border-subtle bg-raised px-2 py-1 text-ui-sm text-primary transition-colors hover:bg-inset"
                        title={entry.insert}
                      >
                        {entry.label}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            </details>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className={cn('text-ui-xs', error ? 'text-danger' : 'text-tertiary')}>
              {error ?? (latex.trim() ? '' : LATEX_PLACEHOLDER)}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onCancel}
                className="rounded-md border border-subtle px-3 py-2 text-ui-sm text-secondary transition-colors hover:bg-inset hover:text-primary"
              >
                {tc('cancel')}
              </button>
              <button
                type="button"
                onClick={commit}
                disabled={!latex.trim() || !!error}
                className="rounded-md bg-accent px-3 py-2 text-ui-sm font-medium text-on-accent hover:bg-accent-hover disabled:opacity-50"
              >
                {tc('save')}
              </button>
            </div>
          </div>
        </>
      ) : (
        <>
          <input
            ref={inputRef}
            type="text"
            value={latex}
            onChange={(e) => setLatex(e.target.value)}
            onKeyDown={handleFallbackKeyDown}
            placeholder={LATEX_PLACEHOLDER}
            className="w-full rounded-md border border-subtle bg-raised px-3 py-2 font-mono text-ui-sm text-primary outline-none placeholder:text-tertiary focus:border-strong"
          />
          {/* Live KaTeX preview — scrolls horizontally when wide, never clips tall
              fractions vertically (same overflow rationale as the editor wrapper). */}
          <div
            className={cn(
              'min-h-8 overflow-x-auto overflow-y-visible rounded-md bg-base p-2 text-center text-read-base leading-normal',
              error && 'text-danger',
            )}
            dangerouslySetInnerHTML={{
              __html: (() => {
                try {
                  return latex.trim()
                    ? katex.renderToString(latex, {
                        displayMode: mode === 'display',
                        throwOnError: true,
                        trust: false,
                        strict: false,
                      })
                    : '';
                } catch {
                  return '';
                }
              })(),
            }}
          />
          {error && <p className="text-ui-xs text-danger">{t('invalidLatex')}</p>}
        </>
      )}
    </div>
  );
}
