import "server-only";
import { publicStore } from "@/lib/auth";
import { supabaseConfigured } from "@/lib/supabase/env";
import type { Dataset } from "@/lib/types";

/** Conjunto de datos público: solo lo publicado. Si todavía no hay nada, el mapa se muestra vacío. */
export async function loadDataset(): Promise<Dataset> {
  try {
    const store = publicStore();
    const [films, orgs] = await Promise.all([store.listFilms(), store.listOrgs()]);
    return { films, orgs, mode: store.mode };
  } catch (e) {
    console.error("[dataset]", e);
    return { films: [], orgs: [], mode: supabaseConfigured() ? "supabase" : "local" };
  }
}
