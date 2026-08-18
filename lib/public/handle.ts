/*
 * The public profile lives at `/@handle`, but `@` cannot be a directory name in
 * the App Router — `app/@foo/` is a parallel route slot, not a URL segment, so
 * `app/@[handle]/page.tsx` never mounted at `/@test` at all. The route is
 * therefore a plain `[handle]` segment and the `@` travels inside the param.
 *
 * Because that segment sits at the root it also catches every unmatched
 * top-level path, so the sigil is what distinguishes a profile URL from a typo.
 */

/** Mirrors the `handle` check constraint in 0001_foundation.sql. */
const HANDLE_RE = /^[a-z0-9][a-z0-9_-]{2,29}$/;

/**
 * Extract the handle from a `[handle]` route segment.
 *
 * Returns null when the segment is not `@handle` or the handle could not exist
 * in `profiles` — the caller should `notFound()`. Rejecting a malformed handle
 * here keeps unmatched paths from reaching the database at all.
 */
export function parseHandleSegment(segment: string): string | null {
  const decoded = decodeURIComponent(segment);
  if (!decoded.startsWith('@')) return null;

  // `handle` is citext, so the lookup is case-insensitive; lowercase here so a
  // link written /@Test hits the same row rather than depending on the client.
  const handle = decoded.slice(1).toLowerCase();
  return HANDLE_RE.test(handle) ? handle : null;
}
