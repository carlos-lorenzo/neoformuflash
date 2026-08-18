import { notFound, redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getSessionUser } from '@/lib/supabase/session';
import { getNoteForUser } from '@/lib/db/notes';
import { getCourse } from '@/lib/db/courses';
import { NoteEditor } from '@/components/editor/note-editor';

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

  // Fetch course name for breadcrumb if note has a course
  let courseName: string | null = null;
  if (result.value.courseId) {
    const courseResult = await getCourse(result.value.courseId);
    if (courseResult.ok && courseResult.value) {
      courseName = courseResult.value.name;
    }
  }

  // Check if user is owner for editor permissions
  const isOwner = result.value.ownerId === user.id;

  return <NoteEditor note={result.value} courseName={courseName} isOwner={isOwner} />;
}