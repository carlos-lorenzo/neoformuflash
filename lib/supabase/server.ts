import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";

import type { Database } from "./types";

function getSupabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error("Missing Supabase environment variables.");
  }

  return { url, anonKey };
}

export async function createClient() {
  const cookieStore = await cookies();
  const { url, anonKey } = getSupabaseEnv();

  const readAllCookies = async () => {
    if (typeof cookieStore.getAll === "function") {
      return cookieStore.getAll();
    }

    const headerStore = await headers();
    const cookieHeader = headerStore.get("cookie");

    if (!cookieHeader) {
      return [] as { name: string; value: string }[];
    }

    return cookieHeader.split(";").map((chunk) => {
      const [rawName, ...rawValue] = chunk.trim().split("=");
      const name = rawName?.trim() ?? "";
      const value = rawValue.join("=");

      return {
        name,
        value: value ? decodeURIComponent(value) : "",
      };
    });
  };

  return createServerClient<Database>(url, anonKey, {
    cookies: {
      async getAll() {
        return readAllCookies();
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
