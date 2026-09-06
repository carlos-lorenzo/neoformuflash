'use client';

/*
 * One card in the grid: index, front, back, delete, save status.
 *
 * Deliberately dumb. Every decision that spans rows — which row is live, where
 * Tab goes, when to append — belongs to MultiCardEditor, because those are the
 * things that break when two rows disagree.
 */

import { useTranslations } from 'next-intl';
import type { NoteDoc } from '@neoformuflash/contracts';
import type { MathEditorFieldHandle } from '@/components/editor/math-editor-field';
import { SaveIndicator } from '@/components/editor/save-indicator';
import type { CardRowState } from '@/lib/decks/use-card-rows';
import { CardFieldCell } from './card-field-cell';
import { DeleteCardButton } from './delete-card-button';

export type CardRowProps = {
  row: CardRowState;
  index: number;
  live: boolean;
  /** Which field autofocuses when the row goes live, and from which end. */
  focusTarget: { side: 'front' | 'back'; pos: 'start' | 'end' } | null;
  frontRef: React.Ref<MathEditorFieldHandle>;
  backRef: React.Ref<MathEditorFieldHandle>;
  onActivate: (side: 'front' | 'back') => void;
  onChange: (side: 'front' | 'back', doc: NoteDoc) => void;
  onTabOut: (side: 'front' | 'back', direction: 'forward' | 'backward') => boolean;
  onFieldFocus: () => void;
  onFieldBlur: () => void;
  onDelete: () => Promise<void>;
  onRetry: () => void;
};

export function CardRow({
  row,
  index,
  live,
  focusTarget,
  frontRef,
  backRef,
  onActivate,
  onChange,
  onTabOut,
  onFieldFocus,
  onFieldBlur,
  onDelete,
  onRetry,
}: CardRowProps) {
  const t = useTranslations('decks');

  const cell = (side: 'front' | 'back') => (
    <CardFieldCell
      live={live}
      doc={side === 'front' ? row.front : row.back}
      label={
        side === 'front'
          ? t('cardGrid.frontOf', { index })
          : t('cardGrid.backOf', { index })
      }
      placeholder={side === 'front' ? t('cardEditor.front') : t('cardEditor.back')}
      autoFocus={focusTarget?.side === side}
      autoFocusPos={focusTarget?.side === side ? focusTarget.pos : 'end'}
      fieldRef={side === 'front' ? frontRef : backRef}
      onActivate={() => onActivate(side)}
      onChange={(doc) => onChange(side, doc)}
      onTabOut={(direction) => onTabOut(side, direction)}
      onFocus={onFieldFocus}
      onBlur={onFieldBlur}
    />
  );

  /*
   * Flex rather than an arbitrary grid template: styles/globals.css resets
   * `--breakpoint-*`, so this project's breakpoints are `tablet:` / `laptop:` /
   * `desktop:` and an `md:` prefix compiles to nothing at all — the silent
   * no-op that assert-classes-compile.mjs exists to catch.
   */
  return (
    <li className="flex items-start gap-3 border-b border-subtle py-3">
      <span className="w-6 shrink-0 pt-2 text-right font-mono text-ui-sm tabular-nums text-tertiary">
        {index}
      </span>

      <div className="flex min-w-0 flex-1 flex-col gap-2 laptop:flex-row laptop:gap-3">
        <div className="min-w-0 flex-1">{cell('front')}</div>
        <div className="min-w-0 flex-1">{cell('back')}</div>
      </div>

      <div className="flex shrink-0 flex-col items-end gap-1">
        <DeleteCardButton index={index} errorCode={row.errorCode} onConfirm={onDelete} />

        <SaveIndicator
          status={row.status}
          onRetry={row.status === 'error' ? onRetry : undefined}
          className="text-ui-xs"
        />
      </div>
    </li>
  );
}
