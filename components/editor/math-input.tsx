// Client: floating card for entering/editing LaTeX with live KaTeX preview.
// Opened by typing $ (inline) or $$ on an empty line (display).
// Commits the math node on Enter; Esc cancels. Invalid LaTeX is shown in
// --danger and never commits (AC5).

'use client';

import { useRef, useState, useMemo, useCallback, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import katex from 'katex';
import { cn } from '@/lib/cn';

type MathInputProps = {
  mode: 'inline' | 'display';
  initialLatex?: string;
  position: { top: number; left: number };
  onCommit: (latex: string) => void;
  onCancel: () => void;
};

// i18n-exempt — "LaTeX" is a proper noun, not translated
const LATEX_PLACEHOLDER = 'LaTeX';

export function MathInput({ mode, initialLatex = '', position, onCommit, onCancel }: MathInputProps) {
  const t = useTranslations('math');
  const [latex, setLatex] = useState(initialLatex);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus the input on mount.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  /*
   * Live preview derived during render via renderToString. The HTML is
   * dangerouslySetInnerHTML'd, but KaTeX runs with trust:false (set in the
   * editor and mirrored here), so \href / \includegraphics cannot inject
   * markup — see note-editor.tsx KATEX_OPTIONS.
   */
  const preview = useMemo(() => {
    if (!latex.trim()) return { html: '', error: null };
    try {
      const html = katex.renderToString(latex, {
        displayMode: mode === 'display',
        throwOnError: true,
        trust: false,
        strict: false,
      });
      return { html, error: null };
    } catch {
      return { html: '', error: t('invalidLatex') };
    }
  }, [latex, mode, t]);

  const commit = useCallback(() => {
    if (!latex.trim() || preview.error) return;
    onCommit(latex);
  }, [latex, preview.error, onCommit]);

  const handleKeyDown = useCallback(
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
      style={{ top: position.top, left: position.left, width: 320 }}
      role="dialog"
      aria-label={mode === 'display' ? t('dialogDisplay') : t('dialogInline')}
    >
      <input
        ref={inputRef}
        type="text"
        value={latex}
        onChange={(e) => setLatex(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={LATEX_PLACEHOLDER}
        className="w-full rounded-md border border-subtle bg-raised px-3 py-2 font-mono text-ui-sm text-primary outline-none placeholder:text-tertiary focus:border-strong"
      />
      {/* Live KaTeX preview */}
      <div
        className={cn(
          'min-h-8 rounded-md bg-base p-2 text-center text-read-base',
          preview.error && 'text-danger',
        )}
        dangerouslySetInnerHTML={{ __html: preview.html }}
      />
      {preview.error && (
        <p className="text-ui-xs text-danger">{t('invalidLatex')}</p>
      )}
    </div>
  );
}
