"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { checkLocalPassword, LOCAL_COOKIE, localCookieValue } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { supabaseConfigured } from "@/lib/supabase/env";
import { createSessionClient } from "@/lib/supabase/server";

export async function localLoginAction(_prev: { error?: string } | undefined, form: FormData) {
  // freno a los intentos de adivinar la contraseña: 8 cada 15 minutos por IP
  const ip = ((await headers()).get("x-forwarded-for") ?? "").split(",")[0].trim() || "local";
  if (!rateLimit(`login:${ip}`, 8, 15 * 60 * 1000).ok) return { error: "Demasiados intentos. Espera unos minutos." };
  const pw = String(form.get("password") ?? "");
  if (!checkLocalPassword(pw)) return { error: "Contraseña incorrecta." };
  (await cookies()).set(LOCAL_COOKIE, localCookieValue()!, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 14,
  });
  redirect("/admin");
}

export async function logoutAction() {
  if (supabaseConfigured()) {
    const sb = await createSessionClient();
    await sb.auth.signOut();
  }
  (await cookies()).delete(LOCAL_COOKIE);
  redirect("/");
}
