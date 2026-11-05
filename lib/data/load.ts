import "server-only";
import { publicStore } from "@/lib/auth";
import { supabaseConfigured } from "@/lib/supabase/env";
import type { Dataset } from "@/lib/types";

/** Conjunto de datos público: solo lo publicado. Si todavía no hay nada, el mapa se muestra vacío. */
export async function loadDataset(): Promise<Dataset> {
  try {
    const store = publicStore();
    const [films, orgs, links] = await Promise.all([
      store.listFilms(),
      store.listOrgs(),
      // sin catálogo o sin la migración del vínculo, simplemente no hay enlaces
      store.festivalOrgMap().catch(() => ({}) as Record<string, string>),
    ]);
    // solo cuentan los vínculos a entidades publicadas
    const published = new Set(orgs.map((o) => o.id));
    const festivalOrgs = Object.fromEntries(Object.entries(links).filter(([, orgId]) => published.has(orgId)));
    return { films, orgs, festivalOrgs, mode: store.mode };
  } catch (e) {
    console.error("[dataset]", e);
    return { films: [], orgs: [], festivalOrgs: {}, mode: supabaseConfigured() ? "supabase" : "local" };
  }
}
