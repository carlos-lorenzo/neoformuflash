import { NextResponse } from "next/server";

import { ensureProfile } from "@/lib/auth/ensure-profile";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");

  if (code) {
    const supabase = createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      return NextResponse.redirect(
        new URL("/login?error=auth", requestUrl.origin),
      );
    }

    if (data.user) {
      await ensureProfile(supabase, data.user);
      return NextResponse.redirect(
        new URL("/dashboard", requestUrl.origin),
      );
    }
  }

  return NextResponse.redirect(new URL("/", requestUrl.origin));
}
