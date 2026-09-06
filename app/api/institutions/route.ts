import { NextResponse, type NextRequest } from 'next/server';
import { searchInstitutions } from '@/lib/db/institutions';

/*
 * Institution type-ahead for signup.
 *
 * Public, like the table it reads: the suggestions have to render before a
 * session exists. It contains nothing about any user — RLS on `institutions`
 * is the actual boundary and this route adds no privilege of its own.
 *
 * Replaces /api/degrees, which fetched the degrees belonging to one
 * institution. Degrees are no longer a table lookup at signup (see
 * 0015_open_taxonomy.sql).
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const query = request.nextUrl.searchParams.get('q') ?? '';

  // A blank query is not an error, it is an empty box. Returning 400 here
  // would make the client render an error state on first paint.
  return NextResponse.json(await searchInstitutions(query));
}
