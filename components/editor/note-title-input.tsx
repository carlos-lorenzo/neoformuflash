// Client: Notion-style title input above the editor canvas.
// No visible border — blends with the reading surface. Autosaved with the doc.

'use client';

import { useTranslations } from 'next-intl';

type NoteTitleInputProps = {
  value: string;
  onChange: (title: string) => void;
};

export function NoteTitleInput({ value, onChange }: NoteTitleInputProps) {
  const t = useTranslations('editor');

  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={t('titlePlaceholder')}
      className="w-full border-none bg-transparent font-serif text-read-h1 text-primary outline-none placeholder:text-tertiary"
      aria-label={t('titlePlaceholder')}
    />
  );
}
