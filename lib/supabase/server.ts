import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./env";

/** Cliente con la sesión de quien navega (cookies). RLS decide qué puede ver o escribir. */
export async function createSessionClient() {
  const store = await cookies();
  return createServerClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) store.set(name, value, options);
        } catch {
          // Llamado desde un Server Component: el middleware refresca la sesión.
        }
      },
    },
  });
}

/** Cliente anónimo sin cookies: lectura pública de lo publicado (RLS). */
export function createPublicClient() {
  return createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
}
