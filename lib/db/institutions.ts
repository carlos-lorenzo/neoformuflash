import { createSupabaseServerClient } from '@/lib/supabase/server';

/*
 * Institution search for signup.
 *
 * Readable anonymously by design — the suggestions have to render before a
 * session exists. Writes are NOT reachable from here: `authenticated` has no
 * insert grant on `institutions`, and the only write path is
 * find_or_create_institution(), which create_profile() calls as the definer
 * (0015_open_taxonomy.sql).
 *
 * There is deliberately no degree equivalent. Degree is free text on
 * `profiles.degree_text`, and building suggestions from
 * `select distinct degree_text from profiles` would be a cross-user
 * enumeration surface over a table public profile pages can read — the same
 * shape as the anonymous claim_profile_slug() oracle (EVOLUTION 2026-08-04).
 * Degree suggestions, if ever wanted, need their own table and policy.
 */

export type Institution = { id: string; slug: string; name: string };

/** Below this, trigram similarity returns mostly noise. */
const MIN_SIMILARITY = 0.1;

/**
 * Fuzzy-search institutions by name.
 *
 * Trigram similarity rather than `ilike '%q%'`: a substring test cannot match
 * a typo ("politecnica" vs "politècnica"), cannot match a partial word order,
 * and gives no ranking to order suggestions by. Backed by
 * `institutions_name_trgm_idx`.
 *
 * Returns [] for a blank query — an empty box shows no suggestions rather than
 * an arbitrary alphabetical slice of every university on the platform.
 */
export async function searchInstitutions(query: string, limit = 10): Promise<Institution[]> {
  const trimmed = query.trim();
  if (trimmed === '') return [];

  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc('search_institutions', {
    p_query: trimmed,
    p_limit: limit,
    p_min_similarity: MIN_SIMILARITY,
  });

  // A failed search must never block signup: the field accepts free text, so
  // an empty suggestion list is a degraded experience, not an error state.
  if (error || !data) return [];
  return data;
}
