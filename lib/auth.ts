import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { LocalStore, SupabaseStore, type Store } from "@/lib/data/store";
import { supabaseConfigured } from "@/lib/supabase/env";
import { createPublicClient, createSessionClient } from "@/lib/supabase/server";

export interface Session {
  id: string;
  email: string;
  role: "admin" | "editor";
  mode: "supabase" | "local";
}

const COOKIE = "mcgt_local";

const localToken = () => {
  const pw = process.env.ADMIN_PASSWORD;
  return pw ? createHash("sha256").update(`mcgt:${pw}`).digest("hex") : null;
};

export function checkLocalPassword(input: string) {
  const pw = process.env.ADMIN_PASSWORD;
  if (!pw) return false;
  const a = Buffer.from(input);
  const b = Buffer.from(pw);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const LOCAL_COOKIE = COOKIE;
export const localCookieValue = localToken;

/** Local sin ADMIN_PASSWORD: abierto solo en desarrollo. */
export const localOpenAccess = () => !process.env.ADMIN_PASSWORD && process.env.NODE_ENV !== "production";

export async function getSession(): Promise<Session | null> {
  if (supabaseConfigured()) {
    const sb = await createSessionClient();
    const { data } = await sb.auth.getUser();
    if (!data.user) return null;
    const { data: profile } = await sb.from("profiles").select("role,email").eq("id", data.user.id).maybeSingle();
    if (!profile) return null;
    return { id: data.user.id, email: profile.email ?? data.user.email ?? "", role: profile.role, mode: "supabase" };
  }
  if (localOpenAccess()) return { id: "local", email: "local@dev", role: "admin", mode: "local" };
  const token = localToken();
  const c = (await cookies()).get(COOKIE)?.value;
  if (token && c === token) return { id: "local", email: "equipo", role: "admin", mode: "local" };
  return null;
}

export async function requireSession(): Promise<Session> {
  const s = await getSession();
  if (!s) redirect("/admin");
  return s;
}

/** Almacén con permisos de escritura del equipo (usa la sesión; RLS lo respalda). */
export async function adminStore(): Promise<Store> {
  if (supabaseConfigured()) return new SupabaseStore(await createSessionClient());
  return new LocalStore();
}

/** Almacén de solo lectura pública. */
export function publicStore(): Store {
  if (supabaseConfigured()) return new SupabaseStore(createPublicClient());
  return new LocalStore();
}
