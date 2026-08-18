// Client: course selector for the deck-create form. Course-first is a UX
// affordance, not a DB invariant (phase-03b H5): standalone decks stay
// first-class, so the picker offers an explicit "no course" option and the
// course field never becomes NOT NULL.

'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Select } from '@/components/ui/select';
import type { CourseSummary } from '@/lib/db/courses';

export function CoursePicker({
  courses,
  value,
  onValueChange,
}: {
  courses: CourseSummary[];
  value: string;
  onValueChange: (value: string) => void;
}) {
  const t = useTranslations('courses');

  const options = [
    { value: '', label: t('picker.none') },
    ...courses.map((course) => ({ value: course.id, label: course.name })),
  ];

  return (
    <div className="flex flex-col gap-2">
      <Select
        label={t('picker.label')}
        placeholder={t('picker.placeholder')}
        emptyLabel={t('picker.empty')}
        options={options}
        value={value}
        onValueChange={onValueChange}
      />
      <Link
        href="/app/courses/new"
        className="text-ui-sm text-accent underline underline-offset-2"
      >
        {t('picker.create')}
      </Link>
    </div>
  );
}
