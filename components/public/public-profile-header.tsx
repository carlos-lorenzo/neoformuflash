// Server Component: public profile header with avatar, name, handle, locale badge.

import Image from 'next/image';
import { getTranslations } from 'next-intl/server';
import type { PublicProfile } from '@neoformuflash/contracts';
import { BookOpenIcon } from '@/components/ui/icon';

export async function PublicProfileHeader({
  profile,
  courseCount,
}: {
  profile: PublicProfile;
  courseCount: number;
}) {
  const t = await getTranslations('publicProfile');

  return (
    <div className="flex flex-col gap-4 py-8">
      <div className="flex flex-col items-center gap-3 text-center">
        {profile.avatarUrl ? (
          <Image
            src={profile.avatarUrl}
            alt=""
            width={64}
            height={64}
            className="h-16 w-16 rounded-full bg-inset object-cover"
            aria-hidden="true"
          />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-inset text-ui-xl font-semibold text-secondary">
            {profile.displayName.charAt(0).toUpperCase()}
          </div>
        )}

        <div className="flex flex-col gap-1">
          <h1 className="text-ui-xl font-semibold text-primary">{profile.displayName}</h1>
          <p className="text-ui-sm text-secondary">@{profile.handle}</p>
        </div>

        <div className="flex items-center gap-4 text-ui-xs tracking-ui text-tertiary">
          <span className="flex items-center gap-1">
            {profile.locale === 'es' && '🇪🇸'}
            {profile.locale === 'en' && '🇬🇧'}
            {profile.locale === 'ca' && '🇦🇩'}
            <span className="uppercase">{profile.locale}</span>
          </span>
          <span className="flex items-center gap-1" aria-label={t('stats.courses', { count: courseCount })}>
            <BookOpenIcon className="text-tertiary" /> {courseCount}
          </span>
        </div>
      </div>

      {/* Ruled grid signature for empty states (design-system.md §8) */}
      <div
        className="relative h-16 bg-base"
        aria-hidden="true"
        style={{
          backgroundImage: `
            linear-gradient(var(--border-subtle) 1px, transparent 1px),
            linear-gradient(90deg, var(--border-subtle) 1px, transparent 1px)
          `,
          backgroundSize: '24px 24px',
          opacity: 0.4,
        }}
      />
    </div>
  );
}