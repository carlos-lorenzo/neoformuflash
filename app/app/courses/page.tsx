import { redirect } from 'next/navigation';

/*
 * Home and Courses were merged into a single dashboard (app/app/page.tsx): the
 * home page lists the user's courses, so the standalone listing here only ever
 * re-rendered the same data behind a second URL. Keep the route alive as a
 * redirect so bookmarks and the delete-course flow still land somewhere real.
 */
export default async function CoursesRedirectPage() {
  redirect('/app');
}
