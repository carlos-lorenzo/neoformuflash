import { createSupabaseServerClient } from '@/lib/supabase/server';

/*
 * The signup taxonomy. Readable anonymously by design — the institution list
 * has to render before a session exists.
 */

export type Institution = { id: string; slug: string; name: string };
export type Degree = { id: string; slug: string; name: string };

export async function listInstitutions(): Promise<Institution[]> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from('institutions')
    .select('id, slug, name')
    .order('name');

  if (error || !data) return [];
  return data;
}

export async function listDegrees(institutionId: string): Promise<Degree[]> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from('degrees')
    .select('id, slug, name')
    .eq('institution_id', institutionId)
    .order('name');

  if (error || !data) return [];
  return data;
}
