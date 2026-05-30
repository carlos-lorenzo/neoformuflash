"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

function getBaseUrl() {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  const vercelUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : null;

  return siteUrl ?? vercelUrl ?? "http://localhost:3000";
}

export async function signInWithGoogle() {
  const supabase = await createClient();
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
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut();

  if (error) {
    throw new Error(error.message);
  }

  redirect("/login");
}
