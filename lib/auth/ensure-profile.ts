import type { SupabaseClient, User } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/types";

function normalizeUsername(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30);
}

export async function ensureProfile(
  supabase: SupabaseClient<Database>,
  user: User,
) {
  const { data: existing, error } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (existing) {
    return;
  }

  const email = user.email ?? "";
  const emailHandle = email.split("@")[0] ?? "user";
  const base = normalizeUsername(emailHandle) || "user";
  const suffix = user.id.replace(/-/g, "").slice(0, 6);
  const username = `${base}-${suffix}`;
  const displayName =
    user.user_metadata?.full_name ??
    user.user_metadata?.name ??
    user.email ??
    "Formuflash User";

  const { error: insertError } = await supabase.from("profiles").insert({
    id: user.id,
    username,
    display_name: displayName,
    avatar_url: user.user_metadata?.avatar_url ?? null,
  });

  if (insertError) {
    throw new Error(insertError.message);
  }
}
