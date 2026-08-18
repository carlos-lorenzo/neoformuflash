// Server Component: public profile page at /@handle.
// Renders the user's public courses and notes. Returns 404 if no public content.

import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getPublicProfile, listPublicCoursesByOwner } from '@/lib/db/profiles';
import { parseHandleSegment } from '@/lib/public/handle';
import { PublicProfileHeader } from '@/components/public/public-profile-header';
import { PublicCourseCard } from '@/components/public/public-course-card';

export async function generateMetadata({ params }: { params: Promise<{ handle: string }> }) {
  const { handle: segment } = await params;
  const handle = parseHandleSegment(segment);
  if (!handle) return { title: 'Not found · FormuFlash' };

  const t = await getTranslations('publicProfile');
  return {
    title: `@${handle} · FormuFlash`,
    description: t('meta.description', { handle }),
    alternates: {
      canonical: `${process.env.NEXT_PUBLIC_SITE_URL ?? 'https://formuflash.com'}/@${handle}`,
    },
  };
}

export default async function PublicProfilePage({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle: segment } = await params;
  // This route sits at the root, so it also receives any unmatched top-level
  // path. Only `@something` is a profile URL; everything else is a 404.
  const handle = parseHandleSegment(segment);
  if (!handle) notFound();

  const t = await getTranslations('publicProfile');

  const profileResult = await getPublicProfile(handle);

  if (!profileResult.ok) {
    return <p className="text-ui-base text-danger">{t('error')}</p>;
  }

  const profile = profileResult.value;
  if (!profile) notFound();

  const coursesResult = await listPublicCoursesByOwner(profile.id);
  const courses = coursesResult.ok ? coursesResult.value : [];

  /*
   * Courses only. Everything in this product hangs off a course — a note and a
   * deck both live inside one — so the profile is a list of courses and the
   * course page is where its notes and decks are found. A flat note list beside
   * the courses duplicated that content one level too early.
   */
  return (
    <div className="mx-auto w-full max-w-measure px-4 py-8">
      <PublicProfileHeader profile={profile} courseCount={courses.length} />

      <section aria-labelledby="courses-heading">
        <h2 id="courses-heading" className="mb-4 text-ui-lg font-semibold text-primary">
          {t('sections.courses')}
        </h2>
        {courses.length === 0 ? (
          <p className="text-ui-sm text-secondary">{t('sections.noCourses')}</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {courses.map((course) => (
              <PublicCourseCard key={course.id} handle={handle} course={course} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}