import { NextResponse, type NextRequest } from "next/server";
import { supabaseConfigured } from "@/lib/supabase/env";
import { createSessionClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/admin";
  if (code && supabaseConfigured()) {
    const sb = await createSessionClient();
    const { error } = await sb.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next.startsWith("/") ? next : "/admin"}`);
  }
  return NextResponse.redirect(`${origin}/admin`);
}
