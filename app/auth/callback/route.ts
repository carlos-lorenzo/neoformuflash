import { NextResponse, type NextRequest } from "next/server";

import { ensureProfile } from "@/lib/auth/ensure-profile";
import { createRouteHandlerClient } from "@/lib/supabase/route-handler";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");

  if (code) {
    const response = NextResponse.redirect(
      new URL("/dashboard", requestUrl.origin),
    );
    const { supabase } = createRouteHandlerClient(request, response);
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      return NextResponse.redirect(
        new URL("/login?error=auth", requestUrl.origin),
      );
    }

    if (data.user) {
      await ensureProfile(supabase, data.user);
      return response;
    }
  }

  return NextResponse.redirect(new URL("/", requestUrl.origin));
}
