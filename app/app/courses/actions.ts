'use server';

/**
 * Server actions for course management.
 *
 * Pattern copied from app/app/decks/actions.ts: re-check auth on every call,
 * Zod validation with catalog-key errors, delegate persistence to lib/db/*.
 */

import { CreateCourseInput, UpdateCourseInput } from '@neoformuflash/contracts';
import type { Route } from 'next';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createCourseRow, updateCourseRow, deleteCourseRow } from '@/lib/db/courses';
import { getSessionUser } from '@/lib/supabase/session';

export type CourseFormState = {
  errors?: Record<string, string>;
};

/**
 * Create a course and redirect into its detail page.
 */
export async function createCourse(
  _previous: CourseFormState,
  formData: FormData,
): Promise<CourseFormState> {
  const user = await getSessionUser();
  if (!user) return { errors: { form: 'error.unexpected' } };

  const rawName = formData.get('name');
  const rawCode = formData.get('code');
  const rawLanguage = formData.get('language');
  const rawVisibility = formData.get('visibility');

  const nameValue = typeof rawName === 'string' ? rawName.trim() : '';
  // Empty-state create (CreateCourseButton) sends no name — mirror the deck
  // discipline and land a draft course the user renames on the detail page.
  const name = nameValue || 'Untitled course';

  const parsed = CreateCourseInput.safeParse({
    name,
    code: typeof rawCode === 'string' && rawCode !== '' ? rawCode : null,
    language: typeof rawLanguage === 'string' ? rawLanguage : 'es',
    visibility: typeof rawVisibility === 'string' ? rawVisibility : 'public',
  });
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0];
      if (typeof field === 'string' && !errors[field]) errors[field] = issue.message;
    }
    return { errors };
  }

  const result = await createCourseRow(user.id, {
    name: parsed.data.name,
    code: parsed.data.code ?? null,
    language: parsed.data.language,
    visibility: parsed.data.visibility,
    institutionId: parsed.data.institutionId ?? null,
    degreeId: parsed.data.degreeId ?? null,
  });

  if (!result.ok) return { errors: { form: result.code } };

  redirect(`/app/courses/${result.value.id}` as Route);
}

/**
 * Save an existing course's editable fields.
 */
export async function saveCourse(
  _previous: CourseFormState,
  formData: FormData,
): Promise<CourseFormState> {
  const user = await getSessionUser();
  if (!user) return { errors: { form: 'error.unexpected' } };

  const id = formData.get('id');
  if (typeof id !== 'string' || !id) return { errors: { form: 'content.course.invalid' } };

  const rawName = formData.get('name');
  const rawCode = formData.get('code');
  const rawLanguage = formData.get('language');
  const rawVisibility = formData.get('visibility');

  const parsed = UpdateCourseInput.safeParse({
    id,
    name: typeof rawName === 'string' ? rawName : undefined,
    code: typeof rawCode === 'string' ? rawCode : null,
    language: typeof rawLanguage === 'string' ? rawLanguage : undefined,
    visibility: typeof rawVisibility === 'string' ? rawVisibility : undefined,
  });
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0];
      if (typeof field === 'string' && !errors[field]) errors[field] = issue.message;
    }
    return { errors };
  }

  const result = await updateCourseRow(user.id, {
    id: parsed.data.id,
    name: parsed.data.name,
    code: parsed.data.code,
    language: parsed.data.language,
    visibility: parsed.data.visibility,
    institutionId: parsed.data.institutionId,
    degreeId: parsed.data.degreeId,
  });

  if (!result.ok) return { errors: { form: result.code } };

  revalidatePath(`/app/courses/${parsed.data.id}`);
  revalidatePath('/app/courses');
  revalidatePath('/app');

  return { errors: {} };
}

/**
 * Delete a course. Goes through delete_course() (0011), which auto-forks
 * subscribers holding progress — never a direct table delete.
 */
export async function deleteCourse(input: { id: string }): Promise<{ errors?: Record<string, string> }> {
  const user = await getSessionUser();
  if (!user) return { errors: { form: 'error.unexpected' } };

  const result = await deleteCourseRow(input.id);
  if (!result.ok) return { errors: { form: result.code } };
  return {};
}
