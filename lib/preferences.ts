import { cookies } from 'next/headers';

/*
 * Layout preferences read during server render.
 *
 * These constants live here rather than in app/actions/preferences.ts because a
 * 'use server' module may only export async functions — every other export
 * becomes a build error.
 */

export const SIDEBAR_COOKIE = 'sidebar-collapsed';

export async function getSidebarCollapsed(): Promise<boolean> {
  const cookieStore = await cookies();
  return cookieStore.get(SIDEBAR_COOKIE)?.value === '1';
}
