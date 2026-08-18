// Client: inline edit overlay for a card during review (owned decks only).
// Built on the shared MathEditorField (front + back, pair mode) so study-view
// editing has full card-editor parity (phase-03b F).
//
// The hook-bearing body lives in InlineEditOverlayBody, mounted ONLY while
// `open` is true. If the hooks ran while the dialog was closed (children of a
// Radix Dialog are still rendered when closed), useActiveScope('editor') would
// push the editor scope permanently and deaden every review shortcut.

'use client';

import { useCallback, useRef, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import type { NoteDoc } from '@neoformuflash/contracts';
import { saveInlineEdit } from '@/app/(review)/actions';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Dialog } from '@/components/ui/dialog';
import { MathEditorField, type MathEditorFieldHandle } from '@/components/editor/math-editor-field';
import { useActiveScope } from '@/lib/shortcuts/use-scope';
import { useShortcut } from '@/lib/shortcuts/use-shortcut';

const EMPTY_DOC: NoteDoc = { type: 'doc', content: [] };

export type InlineEditOverlayProps = {
  open: boolean;
  onClose: () => void;
  cardId: string;
  front: NoteDoc;
  back: NoteDoc;
  confidence: 'again' | 'hard' | 'good' | 'easy' | null;
  onSave: () => void;
};

export function InlineEditOverlay(props: InlineEditOverlayProps) {
  if (!props.open) return null;
  return <InlineEditOverlayBody {...props} />;
}

function InlineEditOverlayBody({
  onClose,
  cardId,
  front,
  back,
  confidence,
  onSave,
}: InlineEditOverlayProps) {
  const t = useTranslations('review');
  // The field labels (front/back/confidence/save) live under decks.cardEditor.*
  // — the card editor is their home namespace. Root-scoped tc for shared copy.
  const td = useTranslations('decks');
  const tc = useTranslations('common');
  const [localConfidence, setLocalConfidence] = useState<'again' | 'hard' | 'good' | 'easy' | null>(confidence);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Editor scope is pushed for the lifetime of the open overlay so ⌘M/⌘⇧M/⌘Enter
  // bindings registered here are active. While editing, review-scope keys
  // (1-4, Space, e) are shadowed — you are editing, not grading. On close the
  // body unmounts, popping the scope and restoring review bindings.
  useActiveScope('editor');

  const frontRef = useRef<MathEditorFieldHandle>(null);
  const backRef = useRef<MathEditorFieldHandle>(null);

  const handleSave = useCallback(() => {
    const frontDoc = frontRef.current?.getDoc() ?? EMPTY_DOC;
    const backDoc = backRef.current?.getDoc() ?? EMPTY_DOC;

    startTransition(async () => {
      // The action re-validates JSON and recomputes text server-side (D3).
      const res = await saveInlineEdit({
        cardId,
        frontJson: frontDoc,
        backJson: backDoc,
        confidence: localConfidence,
      });
      if (!res.ok) {
        setFormError(res.errors?.form ?? 'error.unexpected');
        return;
      }
      onSave();
      onClose();
    });
  }, [cardId, localConfidence, onSave, onClose]);

  const handleCancel = useCallback(() => {
    onClose();
  }, [onClose]);

  // ⌘Enter — save and close (explicitly-saved editors, per specs/shortcuts.md).
  useShortcut('editor', 'mod+enter', handleSave, { label: 'shortcuts.editor.save' });

  // Esc — cancel/close; opts in via allowInEditable (Esc is exempt, not a letter).
  useShortcut('editor', 'Escape', handleCancel, { label: 'shortcuts.editor.cancel', allowInEditable: true });

  // ⌘M / ⌘⇧M — route to whichever field has focus (pair mode: only this overlay
  // registers the bindings, the MathEditorFields are `shortcuts`-disabled).
  const openMathOnFocused = useCallback((display: boolean) => {
    const target = frontRef.current?.isFocused() ? frontRef.current : backRef.current;
    if (!target) return;
    if (display) target.openDisplayMath();
    else target.openInlineMath();
  }, []);

  useShortcut('editor', 'mod+M', () => openMathOnFocused(false), { label: 'shortcuts.editor.inlineMath' });
  useShortcut('editor', 'mod+shift+M', () => openMathOnFocused(true), { label: 'shortcuts.editor.displayMath' });

  return (
    <Dialog
      open
      onOpenChange={onClose}
      title={t('inlineEdit')}
      description={t('inlineEditDesc')}
      closeLabel={tc('close')}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            {tc('cancel')}
          </Button>
          <Button variant="primary" onClick={handleSave} loading={pending}>
            {td('cardEditor.save')}
          </Button>
        </div>
      }
    >
      {formError ? <p className="mb-4 text-ui-sm text-danger">{formError}</p> : null}

      <div className="flex flex-col gap-4">
        <section className="flex flex-col gap-2">
          <h3 className="text-ui-sm font-semibold text-secondary">{td('cardEditor.front')}</h3>
          <div className="rounded-sm border border-subtle bg-inset">
            <MathEditorField
              ref={frontRef}
              content={front}
              onChange={() => {}}
              placeholder={td('cardEditor.front')}
            />
          </div>
        </section>

        <section className="flex flex-col gap-2">
          <h3 className="text-ui-sm font-semibold text-secondary">{td('cardEditor.back')}</h3>
          <div className="rounded-sm border border-subtle bg-inset">
            <MathEditorField
              ref={backRef}
              content={back}
              onChange={() => {}}
              placeholder={td('cardEditor.back')}
            />
          </div>
        </section>

        <Select
          label={td('cardEditor.confidence')}
          placeholder={td('cardEditor.confidence')}
          value={localConfidence ?? undefined}
          onValueChange={(v) => setLocalConfidence(v as 'again' | 'hard' | 'good' | 'easy' | null)}
          emptyLabel=""
          options={[
            { value: 'again', label: td('grade.again') },
            { value: 'hard', label: td('grade.hard') },
            { value: 'good', label: td('grade.good') },
            { value: 'easy', label: td('grade.easy') },
          ]}
        />
      </div>
    </Dialog>
  );
}
