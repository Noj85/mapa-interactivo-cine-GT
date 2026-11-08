import "server-only";
import { publicStore } from "@/lib/auth";
import { supabaseConfigured } from "@/lib/supabase/env";
import { DEFAULT_PUBLIC_STATS, PUBLIC_STATS_KEY, readPublicStats } from "@/lib/site-settings";
import type { Dataset } from "@/lib/types";

/** Conjunto de datos público: solo lo publicado. Si todavía no hay nada, el mapa se muestra vacío. */
export async function loadDataset(): Promise<Dataset> {
  try {
    const store = publicStore();
    const [films, orgs, links, stats] = await Promise.all([
      store.listFilms(),
      store.listOrgs(),
      // sin catálogo o sin la migración del vínculo, simplemente no hay enlaces
      store.festivalOrgMap().catch(() => ({}) as Record<string, string>),
      // sin la tabla de ajustes (migración 0015) se usan los valores por defecto
      store.getSetting(PUBLIC_STATS_KEY).catch(() => null),
    ]);
    // solo cuentan los vínculos a entidades publicadas
    const published = new Set(orgs.map((o) => o.id));
    const festivalOrgs = Object.fromEntries(Object.entries(links).filter(([, orgId]) => published.has(orgId)));
    return { films, orgs, festivalOrgs, mode: store.mode, publicStats: readPublicStats(stats) };
  } catch (e) {
    console.error("[dataset]", e);
    return { films: [], orgs: [], festivalOrgs: {}, mode: supabaseConfigured() ? "supabase" : "local", publicStats: DEFAULT_PUBLIC_STATS };
  }
}

/**
 * Para las páginas que no pueden ser estáticas (`/aportar`, `/descargas`, `/api/export`): reutiliza el
 * conjunto de datos unos minutos dentro de la misma instancia, en vez de consultar Supabase en cada visita.
 * Un error o un conjunto vacío no se guardan.
 */
const TTL_MS = 2 * 60 * 1000;
let memo: { at: number; data: Dataset } | null = null;
let inflight: Promise<Dataset> | null = null;

export async function loadDatasetCached(): Promise<Dataset> {
  if (memo && Date.now() - memo.at < TTL_MS) return memo.data;
  inflight ??= loadDataset()
    .then((data) => {
      if (data.films.length || data.orgs.length) memo = { at: Date.now(), data };
      return data;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}
