// Client: confirms then deletes a course (owner only). Routes through
// deleteCourse, which calls delete_course() — the auto-fork RPC (0011).

'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { deleteCourse } from '@/app/app/courses/actions';

export function DeleteCourseButton({ courseId }: { courseId: string }) {
  const t = useTranslations('courses');
  const tc = useTranslations('common');
  const tError = useTranslations('error');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function confirm() {
    startTransition(async () => {
      const res = await deleteCourse({ id: courseId });
      if (res.errors?.form) {
        // Resolve catalog keys with static t() calls — a dynamic t(code) is
        // invisible to lint:i18n's key existence check (see course-form.tsx).
        setError(
          res.errors.form === 'course.privateRequiresPro'
            ? t('privateRequiresPro')
            : tError('unexpected'),
        );
        return;
      }
      router.push('/app/courses');
    });
  }

  return (
    <>
      <Button variant="destructive" onClick={() => setOpen(true)}>
        {t('detail.delete')}
      </Button>

      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={t('detail.deleteConfirm')}
        closeLabel={tc('cancel')}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              {tc('cancel')}
            </Button>
            <Button variant="destructiveFilled" onClick={confirm} loading={pending}>
              {t('detail.delete')}
            </Button>
          </div>
        }
      >
        <p className="text-ui-sm text-secondary">{t('detail.deleteBody')}</p>
        {error ? <p className="text-ui-sm text-danger">{error}</p> : null}
      </Dialog>
    </>
  );
}
