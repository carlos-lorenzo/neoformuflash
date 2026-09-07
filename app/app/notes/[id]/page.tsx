import { notFound, redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getSessionUser } from '@/lib/supabase/session';
import { getNoteForUser } from '@/lib/db/notes';
import { getCourse } from '@/lib/db/courses';
import { NoteEditor } from '@/components/editor/note-editor';
import { NoteReader } from '@/components/note/note-reader';

export default async function NotePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect('/login');

  const { id } = await params;
  const result = await getNoteForUser(user.id, id);

  if (!result.ok) {
    const t = await getTranslations('notes');
    return <p className="text-ui-base text-danger">{t('error')}</p>;
  }

  if (!result.value) notFound();

  // Check if user is owner for editor permissions. A note the user does not own
  // is only reachable through a course subscription — render it read-only.
  const isOwner = result.value.ownerId === user.id;

  if (!isOwner) {
    // Fetch course for breadcrumb + fork affordance.
    let course: { id: string; name: string; forkCount: number } | null = null;
    if (result.value.courseId) {
      const courseResult = await getCourse(result.value.courseId);
      if (courseResult.ok && courseResult.value) {
        course = {
          id: courseResult.value.id,
          name: courseResult.value.name,
          forkCount: courseResult.value.forkCount,
        };
      }
    }
    return <NoteReader note={result.value} course={course} />;
  }

  // Fetch course name for breadcrumb if note has a course
  let courseName: string | null = null;
  if (result.value.courseId) {
    const courseResult = await getCourse(result.value.courseId);
    if (courseResult.ok && courseResult.value) {
      courseName = courseResult.value.name;
    }
  }

  return <NoteEditor note={result.value} courseName={courseName} isOwner={isOwner} />;
}