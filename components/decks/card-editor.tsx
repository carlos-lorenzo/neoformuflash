// Client: the card editor — front/back MathEditorField instances and the save
// lifecycle.
//
// Shortcuts (editor scope): ⌘Enter save, ⌘⇧Enter save-and-new (new-card page
// only), Esc cancel. ⌘M / ⌘⇧M route to whichever field has focus. Everything is
// also reachable by pointer — shortcuts are an accelerator, never the only path.

'use client';

import { useCallback, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { NoteDoc } from '@neoformuflash/contracts';
import type { CardRow } from '@/lib/db/cards';
import { createCard, updateCard } from '@/app/app/decks/actions';
import { Button } from '@/components/ui/button';
import { MathEditorField, type MathEditorFieldHandle } from '@/components/editor/math-editor-field';
import { useActiveScope } from '@/lib/shortcuts/use-scope';
import { useShortcut } from '@/lib/shortcuts/use-shortcut';

const EMPTY_DOC: NoteDoc = { type: 'doc', content: [] };

export type CardEditorProps = {
  deckId: string;
  /** When provided, this edits an existing card. */
  card?: CardRow;
  /** When true (new-card page), ⌘⇧Enter saves and resets for the next card. */
  allowCreateAnother?: boolean;
};

export function CardEditor({ deckId, card, allowCreateAnother = false }: CardEditorProps) {
  const t = useTranslations('decks');
  // Root-scoped hook for shared chrome copy (cancel/close). Duplicating
  // common.* into every namespace is how catalogs rot.
  const tc = useTranslations('common');
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // Bumped to remount both fields after "save and create another".
  const [resetKey, setResetKey] = useState(0);

  useActiveScope('editor');

  const frontRef = useRef<MathEditorFieldHandle>(null);
  const backRef = useRef<MathEditorFieldHandle>(null);

  const frontPlaceholder = t('cardEditor.front');
  const backPlaceholder = t('cardEditor.back');

  /*
   * Save reads the current doc straight from each ProseMirror instance (the
   * imperative handle bypasses MathEditorField's 150ms onChange debounce, so
   * ⌘Enter immediately after a keystroke never loses content). The action
   * recomputes front_text/back_text server-side (D3) — we don't send text here.
   */
  const onSave = useCallback((createAnother = false) => {
    const frontDoc = frontRef.current?.getDoc() ?? EMPTY_DOC;
    const backDoc = backRef.current?.getDoc() ?? EMPTY_DOC;

    startTransition(async () => {
      if (card) {
        const res = await updateCard({
          id: card.id,
          deckId,
          frontJson: frontDoc,
          backJson: backDoc,
        });
        if (res.errors?.form) {
          setFormError(res.errors.form);
          return;
        }
        // Stay on the edit page (matches the pre-03b editor); the card list
        // picks up the change via router.refresh.
        router.refresh();
      } else {
        const res = await createCard({
          deckId,
          frontJson: frontDoc,
          backJson: backDoc,
        });
        if (res.errors?.form) {
          setFormError(res.errors.form);
          return;
        }
        if (createAnother) {
          // Reset both fields for the next card, keep focus on front.
          setFormError(null);
          setResetKey((k) => k + 1);
        } else {
          router.push(`/app/decks/${deckId}`);
        }
      }
    });
  }, [card, deckId, router]);

  const handleCancel = useCallback(() => {
    router.back();
  }, [router]);

  // ⌘Enter — save (and close on the edit page).
  useShortcut('editor', 'mod+enter', () => onSave(false), { label: 'shortcuts.editor.save' });

  // ⌘⇧Enter — save and create another (new-card page only).
  useShortcut('editor', 'mod+shift+enter', () => {
    if (!allowCreateAnother) return;
    onSave(true);
  }, { label: 'shortcuts.editor.saveAndNew' });

  // Esc — cancel. Opts in via allowInEditable so it dismisses the editor even
  // while focus sits in the Tiptap contenteditable (specs/shortcuts.md: "Never
  // bind" forbids only bare letters in editables; Esc is exempt by opt-in).
  useShortcut('editor', 'Escape', handleCancel, { label: 'shortcuts.editor.cancel', allowInEditable: true });

  /*
   * ⌘M / ⌘⇧M — route to whichever field has focus. The shortcut dispatcher
   * fires only the last-registered match, so two MathEditorFields cannot both
   * register ⌘M; the card editor owns the binding (pair mode).
   */
  const openMathOnFocused = useCallback((display: boolean) => {
    const target = frontRef.current?.isFocused() ? frontRef.current : backRef.current;
    if (!target) return;
    if (display) target.openDisplayMath();
    else target.openInlineMath();
  }, []);

  useShortcut('editor', 'mod+m', () => openMathOnFocused(false), { label: 'shortcuts.editor.inlineMath' });
  useShortcut('editor', 'mod+shift+m', () => openMathOnFocused(true), { label: 'shortcuts.editor.displayMath' });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-4 laptop:flex-row laptop:items-start laptop:gap-4">
        <section className="flex min-w-0 flex-1 flex-col gap-2">
          <h2 className="text-ui-sm font-semibold text-secondary">{t('cardEditor.front')}</h2>
          <div className="rounded-sm border border-subtle bg-inset">
            <MathEditorField
              key={`front-${resetKey}`}
              ref={frontRef}
              content={card ? card.frontJson : EMPTY_DOC}
              onChange={() => {}}
              placeholder={frontPlaceholder}
            />
          </div>
        </section>

        <section className="flex min-w-0 flex-1 flex-col gap-2">
          <h2 className="text-ui-sm font-semibold text-secondary">{t('cardEditor.back')}</h2>
          <div className="rounded-sm border border-subtle bg-inset">
            <MathEditorField
              key={`back-${resetKey}`}
              ref={backRef}
              content={card ? card.backJson : EMPTY_DOC}
              onChange={() => {}}
              placeholder={backPlaceholder}
            />
          </div>
        </section>
      </div>

      {formError ? <p className="text-ui-sm text-danger">{formError}</p> : null}

      <div className="flex items-center justify-between gap-2">
        <Button variant="secondary" onClick={handleCancel} disabled={pending}>
          {tc('cancel')}
        </Button>
        <div className="flex items-center gap-2">
          {allowCreateAnother && (
            <Button variant="secondary" onClick={() => onSave(true)} loading={pending}>
              {t('cardEditor.saveAndNew')}
            </Button>
          )}
          <Button variant="primary" onClick={() => onSave(false)} loading={pending}>
            {t('cardEditor.save')}
          </Button>
        </div>
      </div>
    </div>
  );
}
