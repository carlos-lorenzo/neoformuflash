import { createClient } from "@/lib/supabase/server";

export async function getUser() {
  const supabase = createClient();
  const { data, error } = await supabase.auth.getUser();

  if (error) {
    return null;
  }

  return data.user ?? null;
}
