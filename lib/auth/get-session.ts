import { createClient } from "@/lib/supabase/server";

export async function getSession() {
  const supabase = createClient();
  const { data, error } = await supabase.auth.getSession();

  if (error) {
    return null;
  }

  return data.session ?? null;
}
