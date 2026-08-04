import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/*
 * POST, not GET. A GET sign-out can be triggered by any image tag or link
 * prefetch on a page the user visits, which logs people out at random.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();

  return NextResponse.redirect(`${request.nextUrl.origin}/login`, {
    // 303 so the browser follows with GET rather than repeating the POST.
    status: 303,
  });
}
