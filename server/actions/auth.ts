"use server";

import { createClient } from "@/lib/supabase/server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

function getBaseUrl() {
  const origin = headers().get("origin");
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;

  return origin ?? siteUrl ?? "http://localhost:3000";
}

export async function signInWithGoogle() {
  const supabase = createClient();
  const redirectTo = `${getBaseUrl()}/auth/callback`;
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo },
  });

  if (error) {
    throw new Error(error.message);
  }

  redirect(data.url);
}

export async function signOut() {
  const supabase = createClient();
  const { error } = await supabase.auth.signOut();

  if (error) {
    throw new Error(error.message);
  }

  redirect("/login");
}
