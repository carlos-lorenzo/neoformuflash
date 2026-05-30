import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import type { Database } from "./types";

function getSupabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !anonKey) {
    throw new Error("Missing Supabase environment variables.");
  }

  return { url, anonKey };
}

export async function createClient() {
  const cookieStore = await cookies();
  const { url, anonKey } = getSupabaseEnv();

  return createServerClient<Database>(url, anonKey, {
    cookies: {
      get(name) {
        if (typeof cookieStore.get === "function") {
          return cookieStore.get(name)?.value;
        }

        return undefined;
      },
      set(name, value, options) {
        try {
          if (typeof cookieStore.set === "function") {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Ignore if running in a server component without mutable cookies.
        }
      },
      remove(name, options) {
        try {
          if (typeof cookieStore.set === "function") {
            cookieStore.set(name, "", { ...options, maxAge: 0 });
          }
        } catch {
          // Ignore if running in a server component without mutable cookies.
        }
      },
    },
  });
}
