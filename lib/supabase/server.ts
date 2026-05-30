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

  const getAll = () => {
    if (typeof cookieStore.getAll === "function") {
      return cookieStore.getAll();
    }

    if (typeof (cookieStore as Iterable<{ name: string; value: string }>)[
      Symbol.iterator
    ] === "function") {
      return Array.from(
        cookieStore as Iterable<{ name: string; value: string }>,
      ).map((cookie) => ({ name: cookie.name, value: cookie.value }));
    }

    return [] as { name: string; value: string }[];
  };

  return createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            if (typeof cookieStore.set === "function") {
              cookieStore.set(name, value, options);
            }
          });
        } catch {
          // Ignore if running in a server component without mutable cookies.
        }
      },
    },
  });
}
