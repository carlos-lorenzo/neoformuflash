// Client: inline edit overlay for a card during review (owned decks only).

'use client';

import { useMemo, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { InlineMath, BlockMath } from '@tiptap/extension-mathematics';
import { unionToProse, proseToUnion } from '@/lib/editor/serialize';
import type { NoteDoc } from '@neoformuflash/contracts';
import { saveInlineEdit } from '@/app/(review)/review/[deckId]/actions';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Dialog } from '@/components/ui/dialog';
import '../editor/katex-client';

const KATEX_OPTIONS = { throwOnError: false, trust: false, strict: false } as const;
const InlineMathNoRules = InlineMath.extend({ addInputRules() { return []; } });
const BlockMathNoRules = BlockMath.extend({ addInputRules() { return []; } });

function buildExtensions(placeholder: string) {
  return [
    Placeholder.configure({ placeholder }),
    StarterKit.configure({
      hardBreak: false,
      horizontalRule: false,
      link: false,
      strike: false,
      underline: false,
    }),
    InlineMathNoRules.configure({ katexOptions: { ...KATEX_OPTIONS } }),
    BlockMathNoRules.configure({ katexOptions: { ...KATEX_OPTIONS } }),
  ];
}

export type InlineEditOverlayProps = {
  open: boolean;
  onClose: () => void;
  cardId: string;
  front: NoteDoc;
  back: NoteDoc;
  confidence: 'again' | 'hard' | 'good' | 'easy' | null;
  onSave: () => void;
};

export function InlineEditOverlay({
  open,
  onClose,
  cardId,
  front,
  back,
  confidence,
  onSave,
}: InlineEditOverlayProps) {
  const t = useTranslations('review');
  const [localFront, setLocalFront] = useState(front);
  const [localBack, setLocalBack] = useState(back);
  const [localConfidence, setLocalConfidence] = useState(confidence);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const frontEditor = useEditor({
    extensions: useMemo(
      () => buildExtensions(t('cardEditor.front')),
      [t],
    ),
    content: unionToProse(localFront),
    immediatelyRender: false,
    editorProps: { attributes: { class: 'px-3 py-2' } },
    onUpdate: ({ editor }) => {
      const union = proseToUnion(editor.getJSON());
      if (union.ok) setLocalFront(union.value);
    },
  });

  const backEditor = useEditor({
    extensions: useMemo(
      () => buildExtensions(t('cardEditor.back')),
      [t],
    ),
    content: unionToProse(localBack),
    immediatelyRender: false,
    editorProps: { attributes: { class: 'px-3 py-2' } },
    onUpdate: ({ editor }) => {
      const union = proseToUnion(editor.getJSON());
      if (union.ok) setLocalBack(union.value);
    },
  });

  function editorToText(editor: typeof frontEditor): string {
    return editor?.getText().trim() ?? '';
  }

  async function handleSave() {
    startTransition(async () => {
      const res = await saveInlineEdit({
        cardId,
        frontJson: localFront,
        backJson: localBack,
        frontText: editorToText(frontEditor),
        backText: editorToText(backEditor),
        confidence: localConfidence,
      });
      if (!res.ok) {
        setFormError(res.errors?.form ?? 'error.unexpected');
        return;
      }
      onSave();
      onClose();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onClose}
      title={t('inlineEdit')}
      description={t('inlineEditDesc')}
      closeLabel={t('common.close')}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" onClick={handleSave} loading={pending}>
            {t('cardEditor.save')}
          </Button>
        </div>
      }
    >
      {formError ? <p className="mb-4 text-ui-sm text-danger">{formError}</p> : null}

      <div className="flex flex-col gap-4">
        <section className="flex flex-col gap-2">
          <h3 className="text-ui-sm font-semibold text-secondary">{t('cardEditor.front')}</h3>
          <div className="rounded-sm border border-subtle bg-inset">
            <EditorContent editor={frontEditor} />
          </div>
        </section>

        <section className="flex flex-col gap-2">
          <h3 className="text-ui-sm font-semibold text-secondary">{t('cardEditor.back')}</h3>
          <div className="rounded-sm border border-subtle bg-inset">
            <EditorContent editor={backEditor} />
          </div>
        </section>

        <Select
          label={t('cardEditor.confidence')}
          placeholder={t('cardEditor.confidence')}
          value={localConfidence ?? undefined}
          onValueChange={(v) => setLocalConfidence(v as 'again' | 'hard' | 'good' | 'easy' | null)}
          emptyLabel=""
          options={[
            { value: 'again', label: t('grade.again') },
            { value: 'hard', label: t('grade.hard') },
            { value: 'good', label: t('grade.good') },
            { value: 'easy', label: t('grade.easy') },
          ]}
        />
      </div>
    </Dialog>
  );
}