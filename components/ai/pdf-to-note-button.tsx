'use client';

import { useState, useRef, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Dialog } from '@/components/ui/dialog';

interface PdfToNoteButtonProps {
  courseId?: string | null;
  onSuccess: (noteId: string) => void;
  onRequireKey?: () => void;
}

export function PdfToNoteButton({ courseId, onSuccess, onRequireKey }: PdfToNoteButtonProps) {
  const t = useTranslations('ai.pdf');
  const tCommon = useTranslations('common');
  const tErrors = useTranslations('ai.errors');
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [provider, setProvider] = useState<'openai' | 'anthropic' | 'google'>('openai');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      setFile(f);
      // Suggest title from filename
      if (!title) {
        setTitle(f.name.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' '));
      }
    }
  }, [title]);

  const handleSubmit = useCallback(async () => {
    if (!file) return;
    setUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('title', title);
      formData.append('provider', provider);
      formData.append('courseId', courseId ?? '');

      const res = await fetch('/api/ai/pdf-to-note', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (res.ok) {
        onSuccess(data.noteId);
        setOpen(false);
        setFile(null);
        setTitle('');
        return;
      }

      const errorCode = data.error;
      if (errorCode === 'ai.noKey') {
        onRequireKey?.();
        setOpen(false);
        return;
      }

      // Map server error codes to catalog keys
      const errorKeyMap: Record<string, string> = {
        'ai.invalidKey': 'invalidKey',
        'ai.decryptionFailed': 'decryptionFailed',
        'ai.providerError': 'providerError',
        'ai.invalidOutput': 'invalidOutput',
        'missing_fields': 'missingFields',
        'invalid_input': 'invalidInput',
        'pdf_extraction_failed': 'pdfExtractionFailed',
        'needs_vision': 'needsVision',
        'pdf_empty': 'pdfEmpty',
        'job_creation_failed': 'jobCreationFailed',
        'note_creation_failed': 'noteCreationFailed',
      };
      const catalogKey = errorKeyMap[errorCode];
      // i18n-dynamic-key
      setError(catalogKey ? tErrors(catalogKey) : tErrors('unexpected'));
    } catch {
      // i18n-dynamic-key
      setError(tErrors('unexpected'));
    } finally {
      setUploading(false);
    }
  }, [file, title, provider, courseId, onSuccess, onRequireKey, tErrors]);

  const providers = [
    { value: 'openai', label: t('provider.openai') },
    { value: 'anthropic', label: t('provider.anthropic') },
    { value: 'google', label: t('provider.google') },
  ];

  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => setOpen(true)}
        disabled={uploading}
      >
        {t('button')}
      </Button>

      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={t('title')}
        description={t('description')}
        closeLabel={tCommon('close')}
      >
        <div className="space-y-4 py-2">
          <div>
            <label className="block text-ui-sm font-medium mb-1">{t('file.label')}</label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf"
              onChange={handleFileChange}
              disabled={uploading}
              className="sr-only"
              aria-label={t('file.label')}
            />
            <Button
              variant="secondary"
              className="w-full justify-start"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              {file ? (
                <>
                  <span className="mr-2">📄</span>
                  <span className="truncate block">{file.name}</span>
                </>
              ) : (
                t('file.choose')
              )}
            </Button>
            {file && (
              <p className="mt-1 text-ui-xs text-tertiary">
                {t('file.selected', { name: file.name })}
              </p>
            )}
          </div>

          <Input
            label={t('titleField.label')}
            placeholder={t('titleField.placeholder')}
            value={title}
            onChange={e => setTitle(e.target.value)}
            disabled={uploading}
          />

          <Select
            label={t('provider.label')}
            placeholder={t('provider.placeholder')}
            options={providers}
            value={provider}
            onValueChange={(v: string) => setProvider(v as 'openai' | 'anthropic' | 'google')}
            disabled={uploading}
            emptyLabel={t('provider.placeholder')}
          />

          {error && (
            <p className="text-ui-sm text-danger" role="alert">
              {error}
            </p>
          )}
        </div>
        <div slot="footer" className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={() => setOpen(false)} disabled={uploading}>
            {tCommon('cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={uploading || !file || !title.trim()}>
            {uploading ? t('processing') : t('generate')}
          </Button>
        </div>
      </Dialog>
    </>
  );
}