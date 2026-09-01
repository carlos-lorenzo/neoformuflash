'use client';

import { useState, useCallback, useMemo, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import { Input } from '@/components/ui/input';

// Attached-material client-side ceiling. Server enforces the same limit.
const MAX_MATERIAL_BYTES = 10 * 1024 * 1024; // 10 MB
const MATERIAL_ACCEPT = '.pdf,.txt,.md,application/pdf,text/plain,text/markdown';
import type { Editor } from '@tiptap/core';
import type { NoteDoc } from '@neoformuflash/contracts';
import { unionToProse } from '@/lib/editor/serialize';
import { mdToNoteDoc } from '@/lib/editor/md-to-note-doc';
import { NoteDocView } from '@/components/note/note-doc-view';

interface CopilotMenuProps {
  editor: Editor;
  selectionText: string | null;
  onClose: () => void;
  isOpen: boolean;
  noteId: string;
  availableProviders: Array<'openai' | 'anthropic' | 'google' | 'deepseek'>;
  defaultProvider?: 'openai' | 'anthropic' | 'google' | 'deepseek';
}

type CopilotAction = 'generate' | 'explain' | 'summarize' | 'rephrase' | 'continue' | 'fix_latex' | 'generate_cards';

const ACTION_IDS: CopilotAction[] = ['generate', 'explain', 'summarize', 'rephrase', 'continue', 'fix_latex', 'generate_cards'];

/** Actions that transform selected text (should replace selection) */
const REPLACE_ACTIONS: CopilotAction[] = ['explain', 'summarize', 'rephrase', 'fix_latex'];

/** Actions that add new content (should insert at cursor) */
const INSERT_ACTIONS: CopilotAction[] = ['generate', 'continue'];

function isReplaceAction(action: CopilotAction): boolean {
  return REPLACE_ACTIONS.includes(action);
}

function isInsertAction(action: CopilotAction): boolean {
  return INSERT_ACTIONS.includes(action);
}

function usePreviewDoc(result: { type: 'noteDoc' | 'text' | 'deckId'; value: NoteDoc | string } | null): NoteDoc | null {
  return useMemo(() => {
    if (!result) return null;
    if (result.type === 'noteDoc') return result.value as NoteDoc;
    if (result.type === 'deckId') return null; // No preview for deck creation
    // Text results are the model's markdown — convert to the same NoteDoc shape
    // so the preview matches hand-typed content exactly (KaTeX, marks, blocks).
    return mdToNoteDoc(result.value as string);
  }, [result]);
}

export function CopilotMenu({ editor, selectionText, onClose, isOpen, noteId, availableProviders, defaultProvider }: CopilotMenuProps) {
  const t = useTranslations('ai.copilot');
  const tCommon = useTranslations('common');
  const tErrors = useTranslations('ai.errors');
  const router = useRouter();
  const [activeAction, setActiveAction] = useState<CopilotAction>('generate');
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ type: 'noteDoc' | 'text' | 'deckId'; value: NoteDoc | string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [provider, setProvider] = useState<'openai' | 'anthropic' | 'google' | 'deepseek'>(() => {
    if (defaultProvider && availableProviders.includes(defaultProvider)) {
      return defaultProvider;
    }
    return availableProviders[0] ?? 'openai';
  });

  // Deck selection state (for generate_cards action)
  const [deckTarget, setDeckTarget] = useState<'new_deck' | 'existing_deck'>('new_deck');
  const [deckId, setDeckId] = useState('');

  // Attached material state (PDF / .txt / .md — not persisted, sent per-request)
  const [materialFile, setMaterialFile] = useState<File | null>(null);
  const [materialError, setMaterialError] = useState<string | null>(null);
  const materialInputRef = useRef<HTMLInputElement>(null);

  const handleMaterialChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setMaterialError(null);
    if (f.size > MAX_MATERIAL_BYTES) {
      setMaterialError(t('material.tooLarge'));
      // Reset input so the same file can be re-selected after fixing size
      if (materialInputRef.current) materialInputRef.current.value = '';
      return;
    }
    const name = f.name.toLowerCase();
    const mime = f.type;
    const ok =
      mime === 'application/pdf' ||
      mime === 'text/plain' ||
      mime === 'text/markdown' ||
      mime === 'text/x-markdown' ||
      name.endsWith('.pdf') || name.endsWith('.txt') || name.endsWith('.md');
    if (!ok) {
      setMaterialError(t('material.unsupported'));
      if (materialInputRef.current) materialInputRef.current.value = '';
      return;
    }
    setMaterialFile(f);
  }, [t]);

  const handleMaterialRemove = useCallback(() => {
    setMaterialFile(null);
    setMaterialError(null);
    if (materialInputRef.current) materialInputRef.current.value = '';
  }, []);

  // The preview always renders as a NoteDoc (math, marks, blocks exactly like
  // hand-typed content). Text results are converted from the model's markdown.
  const previewDoc = usePreviewDoc(result);

  const isDeckActionType = activeAction === 'generate_cards';
  const needsPrompt = activeAction === 'generate';
  const needsSelection = !['generate', 'generate_cards'].includes(activeAction);
  const needsDeckSelection = isDeckActionType;
  const canRun = isDeckActionType
    ? (deckTarget === 'new_deck' || (deckTarget === 'existing_deck' && deckId.trim()))
    : ((needsPrompt ? prompt.trim() : true) && (needsSelection ? selectionText : true));

  const handleRun = useCallback(async () => {
    if (!canRun || loading) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      // Use FormData to support optional material file upload.
      // For generate_cards, we still send JSON (no material support needed).
      // For other actions, send multipart/form-data with optional `file`.
      const isFormData = !isDeckActionType;

      let noteRes: Response;

      if (isFormData) {
        const formData = new FormData();
        formData.append('noteId', noteId);
        formData.append('action', activeAction);
        formData.append('provider', provider);
        if (needsPrompt) formData.append('prompt', prompt);
        if (selectionText) formData.append('selectionText', selectionText);
        if (materialFile) formData.append('file', materialFile);

        noteRes = await fetch('/api/ai/copilot', {
          method: 'POST',
          body: formData,
        });
      } else {
        // generate_cards path stays as JSON (no file upload)
        const body: Record<string, unknown> = {
          noteId,
          action: activeAction,
          provider,
          target: deckTarget,
          deckId: deckTarget === 'existing_deck' ? deckId : null,
        };
        noteRes = await fetch('/api/ai/copilot', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
      }

      const data = await noteRes.json();

      if (!noteRes.ok) {
        throw new Error(data.error || 'Request failed');
      }

      /*
       * A 200 is not proof of a usable answer. `JSON.stringify` drops an
       * undefined `value`, so a malformed provider response arrived here as
       * `{type:'text'}` with no value at all — which rendered as a blank
       * preview and an Insert that did nothing. Surface it as an error the
       * user can retry instead of showing silence.
       */
      const payload = data.result;
      const hasValue = payload && payload.type === 'deckId'
        ? typeof payload.value === 'string'
        : payload && payload.value != null;
      if (!hasValue) {
        throw new Error('ai.invalidOutput');
      }

      setResult(payload);

      // For generate_cards, navigate to the deck on success
      if (isDeckActionType && data.result?.type === 'deckId') {
        router.push(`/app/decks/${data.result.value}`);
        onClose();
      }
    } catch (err) {
      const errorCode = err instanceof Error ? err.message : 'unknown';
      const errorKeyMap: Record<string, string> = {
        'ai.noKey': 'noKey',
        'ai.invalidKey': 'invalidKey',
        'ai.decryptionFailed': 'decryptionFailed',
        'ai.providerError': 'providerError',
        'ai.invalidOutput': 'invalidOutput',
        // Classified provider errors — each has its own catalogue entry so the
        // user sees "rate limit — wait a minute" instead of the generic
        // "AI provider failed" and knows whether retrying will help.
        'ai.rateLimit': 'rateLimit',
        'ai.quotaExceeded': 'quotaExceeded',
        'ai.providerUnavailable': 'providerUnavailable',
        'ai.providerTimeout': 'providerTimeout',
        'content.deck.notFound': 'content_deck_notFound',
        'ai.emptyNote': 'ai_emptyNote',
        'invalid_input': 'invalidInput',
        // Material-specific errors
        'ai.material.tooLarge': 'material.tooLarge',
        'ai.material.unsupported': 'material.unsupported',
        'ai.material.extractionFailed': 'material.extractionFailed',
        'ai.material.needsVision': 'material.needsVision',
        'ai.material.empty': 'material.empty',
      };
      const catalogKey = errorKeyMap[errorCode];
      // i18n-dynamic-key
      setError(catalogKey ? tErrors(catalogKey) : tErrors('unexpected'));
    } finally {
      setLoading(false);
    }
  }, [activeAction, canRun, loading, needsPrompt, isDeckActionType, noteId, prompt, provider, selectionText, deckTarget, deckId, materialFile, tErrors, router, onClose]);

  const handleInsert = useCallback(() => {
    if (!result) return;

    if (result.type === 'noteDoc') {
      const proseDoc = unionToProse(result.value as NoteDoc);
      // For generate action: always insert at cursor position (don't replace selection)
      // For continue action: append after selection (move cursor to end, don't delete)
      if (activeAction === 'continue' && selectionText) {
        // Move cursor to end of selection, then insert (without deleting)
        editor.chain().focus().insertContent(proseDoc).run();
      } else {
        // For generate and other insert actions: just insert at cursor
        editor.chain().focus().insertContent(proseDoc).run();
      }
    } else {
      // Text results are the model's markdown. Route through mdToNoteDoc so the
      // math + marks become real ProseMirror nodes (the manual-editor path),
      // not literal `$…$` text. Math input rules are disabled Tiptap-wide, so
      // inserting the string directly would never convert them.
      const doc = mdToNoteDoc(result.value as string);
      const proseDoc = unionToProse(doc);
      if (activeAction === 'continue' && selectionText) {
        editor.chain().focus().insertContent(proseDoc).run();
      } else {
        editor.chain().focus().insertContent(proseDoc).run();
      }
    }
    onClose();
  }, [editor, onClose, result, selectionText, activeAction]);

  const handleInsertAfter = useCallback(() => {
    if (!result) return;

    if (result.type === 'noteDoc') {
      const proseDoc = unionToProse(result.value as NoteDoc);
      // Move cursor to end of selection, then insert (without deleting)
      editor.chain().focus().insertContent(proseDoc).run();
    } else {
      // Text results are the model's markdown. Route through mdToNoteDoc so the
      // math + marks become real ProseMirror nodes (the manual-editor path),
      // not literal `$…$` text. Math input rules are disabled Tiptap-wide, so
      // inserting the string directly would never convert them.
      const doc = mdToNoteDoc(result.value as string);
      const proseDoc = unionToProse(doc);
      editor.chain().focus().insertContent(proseDoc).run();
    }
    onClose();
  }, [editor, onClose, result]);

  const handleReplace = useCallback(() => {
    if (!result || result.type !== 'text') return;
    const doc = mdToNoteDoc(result.value as string);
    const proseDoc = unionToProse(doc);
    // Replace actions always delete selection and insert
    if (selectionText) {
      editor.chain().focus().deleteSelection().insertContent(proseDoc).run();
    } else {
      editor.chain().focus().insertContent(proseDoc).run();
    }
    onClose();
  }, [editor, onClose, result, selectionText]);

  if (!isOpen) return null;

  const providers = availableProviders.map((p) => ({
    value: p,
    label: t(`provider.${p}`),
  }));

  const runButtonLabel = isDeckActionType ? t('deckSelection.generate') : t('run');
  const runButtonLoadingLabel = isDeckActionType ? t('deckSelection.generating') : t('running');

  const footer = (
    <div className="flex items-center justify-end gap-2 w-full pt-4">
      <Button variant="ghost" size="sm" onClick={onClose} disabled={loading}>
        {tCommon('close')}
      </Button>
      <Button
        variant="primary"
        size="md"
        onClick={handleRun}
        disabled={!canRun || loading}
        loading={loading}
        loadingLabel={runButtonLoadingLabel}
      >
        {runButtonLabel}
      </Button>
    </div>
  );

  return (
    <Dialog
      open={isOpen}
      onOpenChange={open => !open && onClose()}
      title={t('title')}
      description={t('description')}
      closeLabel={tCommon('close')}
      size="lg"
      footer={footer}
    >
      <div className="space-y-4">
        {/* Action picker — radiogroup of buttons, full width, 2-col on mobile / 3-col on tablet */}
        <div className="grid grid-cols-2 gap-2 tablet:grid-cols-3" role="radiogroup" aria-label={t('actionsLabel')}>
          {ACTION_IDS.map((id) => (
            <button
              key={id}
              role="radio"
              aria-checked={activeAction === id}
              onClick={() => { setActiveAction(id); setResult(null); setError(null); }}
              className={cn(
                'min-h-11 rounded-md text-ui-sm font-medium transition-colors duration-instant',
                activeAction === id
                  ? 'bg-accent-quiet text-accent'
                  : 'bg-inset hover:bg-raised'
              )}
            >
              {t(`actions.${id}`)}
            </button>
          ))}
        </div>

        {/* Active action description — full width, drives no track sizing */}
        <p className="text-ui-sm text-tertiary">{t(`actionDescriptions.${activeAction}`)}</p>

        {/* Work area — full dialog width */}
        <div className="space-y-4">
          {needsPrompt && (
            <div>
              <Textarea
                label={t('prompt')}
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                placeholder={t('promptPlaceholder')}
                rows={5}
                disabled={loading}
              />
            </div>
          )}

          {/* Attach Material — available for all actions except generate_cards */}
          {!isDeckActionType && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-ui-sm font-medium">{t('material.label')}</label>
                <input
                  ref={materialInputRef}
                  type="file"
                  accept={MATERIAL_ACCEPT}
                  onChange={handleMaterialChange}
                  disabled={loading}
                  className="sr-only"
                  aria-label={t('material.label')}
                />
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => materialInputRef.current?.click()}
                  disabled={loading || !!materialFile}
                >
                  {materialFile ? (
                    <>
                      <span className="mr-2">📎</span>
                      <span className="truncate block max-w-file-name">{materialFile.name}</span>
                    </>
                  ) : (
                    t('material.label')
                  )}
                </Button>
              </div>
              {materialFile && (
                <div className="flex items-center justify-between text-ui-sm">
                  <span className="text-tertiary">{t('material.selected', { name: materialFile.name })}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleMaterialRemove}
                    disabled={loading}
                    aria-label={t('material.remove')}
                  >
                    {t('material.remove')}
                  </Button>
                </div>
              )}
              {materialError && (
                <p className="text-ui-sm text-danger" role="alert">
                  {materialError}
                </p>
              )}
            </div>
          )}

          {needsSelection && !selectionText && (
            <p className="text-ui-sm text-tertiary p-3 rounded bg-tertiary/10">
              {t('selectTextFirst')}
            </p>
          )}

          {/* Deck selection for generate_cards action */}
          {needsDeckSelection && (
            <div className="space-y-4">
              <div>
                <Select
                  label={t('deckSelection.targetLabel')}
                  placeholder={t('deckSelection.targetPlaceholder')}
                  options={[
                    { value: 'new_deck', label: t('deckSelection.newDeck') },
                    { value: 'existing_deck', label: t('deckSelection.existingDeck') },
                  ]}
                  value={deckTarget}
                  onValueChange={(v: string) => setDeckTarget(v as 'new_deck' | 'existing_deck')}
                  disabled={loading}
                  emptyLabel={t('deckSelection.targetPlaceholder')}
                />
              </div>

              {deckTarget === 'existing_deck' && (
                <Input
                  label={t('deckSelection.deckIdLabel')}
                  placeholder={t('deckSelection.deckIdPlaceholder')}
                  value={deckId}
                  onChange={e => setDeckId(e.target.value)}
                  disabled={loading}
                />
              )}
            </div>
          )}

          {error && (
            <div className="p-3 rounded bg-inset border border-subtle text-danger text-ui-sm" role="alert">
              <div className="flex items-center justify-between mb-1">
                <span>{t('error')}</span>
                <button
                  onClick={() => setError(null)}
                  className="text-danger hover:text-danger/70 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 rounded-sm p-1"
                  aria-label={t('dismissError')}
                >
                  <svg aria-hidden="true" viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
              <p>{error}</p>
              <Button variant="secondary" size="sm" onClick={handleRun} className="mt-2">
                {t('retry')}
              </Button>
            </div>
          )}

          {result && (
            <div className="space-y-3">
              <div className="p-3 rounded bg-raised border border-subtle max-h-outline overflow-auto">
                {previewDoc && <NoteDocView doc={previewDoc} />}
              </div>
              <div className="flex flex-wrap gap-2">
                {isReplaceAction(activeAction) && selectionText && (
                  <Button variant="secondary" onClick={handleReplace}>
                    {t('replaceSelection')}
                  </Button>
                )}
                {isInsertAction(activeAction) && (
                  <Button variant="secondary" onClick={handleInsert}>
                    {t('insertAtCursor')}
                  </Button>
                )}
                {/* For insert actions with selection, also offer "Insert after selection" */}
                {isInsertAction(activeAction) && selectionText && (
                  <Button variant="secondary" onClick={handleInsertAfter}>
                    {t('insertAfterSelection')}
                  </Button>
                )}
                {/* For replace actions without selection, or insert actions with selection,
                    show the alternative button as well */}
                {isReplaceAction(activeAction) && !selectionText && (
                  <Button variant="secondary" onClick={handleInsert}>
                    {t('insertAtCursor')}
                  </Button>
                )}
                {isReplaceAction(activeAction) && selectionText && (
                  <Button variant="ghost" onClick={handleInsert}>
                    {t('insertAtCursor')}
                  </Button>
                )}
                <Button variant="ghost" onClick={() => setResult(null)}>
                  {t('discard')}
                </Button>
              </div>
            </div>
          )}

          {/* Provider selector at the bottom of the work area */}
          <div>
            <Select
              label={t('provider.label')}
              placeholder={t('provider.placeholder')}
              options={providers}
              value={provider}
              onValueChange={(v: string) => setProvider(v as 'openai' | 'anthropic' | 'google' | 'deepseek')}
              disabled={loading}
              emptyLabel={t('provider.placeholder')}
            />
          </div>
        </div>
      </div>
    </Dialog>
  );
}