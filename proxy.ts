import type { NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Everything except Next's own build output.
     *
     * This used to also exclude any path ending in an image or font extension,
     * which meant `/app/anything.png` skipped the middleware entirely — the
     * guard in `updateSession` never ran for it. Harmless while every route
     * under `/app/` is also covered by the server-side check in
     * `app/app/layout.tsx`, and a real auth bypass the moment phase 01 adds one
     * that isn't.
     *
     * The exclusion bought nothing anyway: there is no `public/` directory, so
     * every asset this app serves already comes from `_next/`.
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
