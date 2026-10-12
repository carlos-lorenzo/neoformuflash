// Client: per-note settings dialog — publish toggle, SEO metadata, delete.
// Replaces the SeoForm + PublishForm panels that lived in the editor sidebar.
// Opened via a gear button in the editor header.

'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { SeoForm } from './seo-form';
import { PublishForm } from './publish-form';
import { deleteNote } from '@/app/app/notes/actions';

function GearIcon({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

export function NoteSettingsDialog({
  noteId,
  isPublished,
}: {
  noteId: string;
  isPublished: boolean;
}) {
  const t = useTranslations('notes.settings');
  const tc = useTranslations('common');
  const tError = useTranslations('error');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function confirm() {
    startTransition(async () => {
      const res = await deleteNote({ id: noteId });
      if (res.errors?.form) {
        setError(tError('unexpected'));
        return;
      }
      setOpen(false);
      if (res.courseId) {
        router.push(`/app/courses/${res.courseId}`);
      } else {
        router.push('/app');
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setConfirmDelete(false);
          setError(null);
          setOpen(true);
        }}
        className="flex size-11 shrink-0 items-center justify-center rounded-md border border-subtle bg-raised text-secondary transition-colors hover:bg-inset hover:text-primary"
        aria-label={t('openLabel')}
        title={t('openLabel')}
      >
        <GearIcon className="size-4" />
      </button>

      <Dialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) setConfirmDelete(false);
        }}
        title={t('title')}
        description={t('description')}
        closeLabel={tc('cancel')}
        size="md"
      >
        <div className="flex flex-col gap-4">
          {/* Publish toggle — notes are published by default; this is
              effectively Unpublish, and Publish again once unpublished. */}
          <PublishForm noteId={noteId} isPublished={isPublished} />

          {/* SEO metadata */}
          <SeoForm
            noteId={noteId}
            initial={{
              ogTitle: '',
              ogDescription: '',
              ogImageUrl: '',
            }}
          />

          {/* Danger zone — delete */}
          <div className="rounded-md border border-danger/40 p-4">
            <p className="text-ui-sm font-semibold text-danger">{t('deleteTitle')}</p>
            <p className="mt-1 text-ui-sm text-secondary">{t('deleteBody')}</p>
            {error ? (
              <p className="mt-2 text-ui-sm text-danger" role="alert">
                {error}
              </p>
            ) : null}
            {!confirmDelete ? (
              <Button
                variant="destructive"
                className="mt-3"
                onClick={() => setConfirmDelete(true)}
              >
                {t('deleteButton')}
              </Button>
            ) : (
              <div className="mt-3 flex justify-end gap-2">
                <Button variant="secondary" onClick={() => setConfirmDelete(false)}>
                  {tc('cancel')}
                </Button>
                <Button variant="destructiveFilled" onClick={confirm} loading={pending}>
                  {t('deleteConfirm')}
                </Button>
              </div>
            )}
          </div>
        </div>
      </Dialog>
    </>
  );
}
