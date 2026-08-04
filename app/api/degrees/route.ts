import { NextResponse, type NextRequest } from 'next/server';
import { listDegrees } from '@/lib/db/institutions';

/*
 * Degrees for one institution, so the onboarding form can populate its second
 * select without shipping every degree at 54 universities in the initial HTML.
 *
 * Public, like the taxonomy itself — signup needs it and it contains nothing
 * about any user. RLS on `degrees` is the actual boundary; this route adds no
 * privilege of its own.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const institutionId = request.nextUrl.searchParams.get('institutionId');

  if (!institutionId) {
    return NextResponse.json([], { status: 400 });
  }

  return NextResponse.json(await listDegrees(institutionId));
}
