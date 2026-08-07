// Client: the card editor — front/back Tiptap instances, confidence select,
// save lifecycle.
//
// New component, deliberately NOT a refactor of NoteEditor: NoteEditor owns
// note autosave and is not reusable as-is. The Tiptap extension config
// (StarterKit + InlineMath/BlockMath with input rules disabled + KaTeX
// katex-client) is duplicated locally so this file is self-contained.

'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { InlineMath, BlockMath } from '@tiptap/extension-mathematics';
import { unionToProse, proseToUnion } from '@/lib/editor/serialize';
import type { NoteDoc } from '@neoformuflash/contracts';
import type { CardRow } from '@/lib/db/cards';
import { createCard, updateCard } from '@/app/app/decks/actions';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import '../editor/katex-client';

/*
 * KaTeX runs with trust off so \href / \includegraphics cannot smuggle markup
 * (specs/EVOLUTION.md names Tiptap as the anticipated XSS vector).
 */
const KATEX_OPTIONS = { throwOnError: false, trust: false, strict: false } as const;

/*
 * The extension's input rules convert literal `$$…$$` text into math nodes —
 * the same bypass concern as NoteEditor. Disabled here too.
 */
const InlineMathNoRules = InlineMath.extend({ addInputRules() { return []; } });
const BlockMathNoRules = BlockMath.extend({ addInputRules() { return []; } });

const EMPTY_DOC: NoteDoc = { type: 'doc', content: [] };

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

export type CardEditorProps = {
  deckId: string;
  /** When provided, this edits an existing card. */
  card?: CardRow;
};

export function CardEditor({ deckId, card }: CardEditorProps) {
  const t = useTranslations('decks');
  const router = useRouter();
  const [confidence, setConfidence] = useState<'again' | 'hard' | 'good' | 'easy' | null>(
    (card?.confidence as 'again' | 'hard' | 'good' | 'easy' | null | undefined) ?? 'good',
  );
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const frontPlaceholder = t('cardEditor.front');
  const backPlaceholder = t('cardEditor.back');

  const frontEditor = useEditor({
    extensions: useMemo(() => buildExtensions(frontPlaceholder), [frontPlaceholder]),
    content: card ? unionToProse(card.frontJson) : { type: 'doc', content: [{ type: 'paragraph' }] },
    immediatelyRender: false,
    editorProps: { attributes: { class: 'px-3 py-2' } },
  });

  const backEditor = useEditor({
    extensions: useMemo(() => buildExtensions(backPlaceholder), [backPlaceholder]),
    content: card ? unionToProse(card.backJson) : { type: 'doc', content: [{ type: 'paragraph' }] },
    immediatelyRender: false,
    editorProps: { attributes: { class: 'px-3 py-2' } },
  });

  function editorToUnion(editor: typeof frontEditor): { json: NoteDoc; text: string } {
    if (!editor) return { json: EMPTY_DOC, text: '' };
    const raw = editor.getJSON();
    const union = proseToUnion(raw);
    return { json: union.ok ? union.value : EMPTY_DOC, text: editor.getText().trim() };
  }

  function onSave() {
    const front = editorToUnion(frontEditor);
    const back = editorToUnion(backEditor);

    startTransition(async () => {
      if (card) {
        const res = await updateCard({
          id: card.id,
          deckId,
          frontJson: front.json,
          backJson: back.json,
          frontText: front.text,
          backText: back.text,
          confidence,
        });
        if (res.errors?.form) {
          setFormError(res.errors.form);
          return;
        }
        router.refresh();
      } else {
        const res = await createCard({
          deckId,
          frontJson: front.json,
          backJson: back.json,
          frontText: front.text,
          backText: back.text,
          position: 0,
          confidence,
        });
        if (res.errors?.form) {
          setFormError(res.errors.form);
          return;
        }
        router.push(`/app/decks/${deckId}`);
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-4">
        <section className="flex flex-col gap-2">
          <h2 className="text-ui-sm font-semibold text-secondary">{t('cardEditor.front')}</h2>
          <div className="rounded-sm border border-subtle bg-inset">
            <EditorContent editor={frontEditor} />
          </div>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-ui-sm font-semibold text-secondary">{t('cardEditor.back')}</h2>
          <div className="rounded-sm border border-subtle bg-inset">
            <EditorContent editor={backEditor} />
          </div>
        </section>
      </div>

      <div className="w-full">
        <Select
          label={t('cardEditor.confidence')}
          placeholder={t('cardEditor.confidence')}
          value={confidence ?? undefined}
          onValueChange={(v) => setConfidence(v as 'again' | 'hard' | 'good' | 'easy')}
          emptyLabel=""
          options={[
            { value: 'again', label: t('grade.again') },
            { value: 'hard', label: t('grade.hard') },
            { value: 'good', label: t('grade.good') },
            { value: 'easy', label: t('grade.easy') },
          ]}
        />
      </div>

      {formError ? <p className="text-ui-sm text-danger">{formError}</p> : null}

      <div className="flex items-center justify-between">
        <Button
          variant="secondary"
          onClick={() => router.back()}
          disabled={pending}
        >
          {t('common.cancel')}
        </Button>
        <Button variant="primary" onClick={onSave} loading={pending}>
          {t('cardEditor.save')}
        </Button>
      </div>
    </div>
  );
}
