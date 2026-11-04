import { adminStore, getSession } from "@/lib/auth";
import { loadDataset } from "@/lib/data/load";
import { buildTable, filterSlug, toCsv, toXlsx } from "@/lib/export";
import { describeFilmFilter, describeOrgFilter, filterFilms, filterOrgs, parseFilmFilter, parseOrgFilter, type ExportKind } from "@/lib/filters";
import { serverGazetteer } from "@/lib/geo/server";
import type { Film, Org } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Descarga de datos, abierta a cualquier persona (solo lo publicado).
 *
 *  tipo       peliculas (por defecto) | locaciones | entidades
 *  formato    csv (por defecto) | xlsx
 *
 *  Filtros de películas y locaciones:
 *    depto=7,1            códigos INE de departamento (al menos una locación ahí)
 *    muni=101             códigos INE de municipio
 *    clase=ficcion,corto  tipo de obra
 *    nacionalidad=guatemalteca,coproduccion
 *    desde=2010&hasta=2024
 *    presupuesto_min=500000&presupuesto_max=2000000&moneda=GTQ|USD
 *    completas=1          solo con todas las locaciones ubicadas en un municipio
 *    q=texto              título, dirección o productora
 *
 *  Filtros de entidades:
 *    capa=circulacion|industria
 *    categoria=Festivales,Productoras
 *    iniciativa=publica,privada
 *    depto=… y q=…
 *
 *  borradores=1 incluye borradores (solo con sesión del equipo).
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const p = url.searchParams;
  const rawTipo = p.get("tipo") ?? "peliculas";
  const tipo: ExportKind = rawTipo === "locaciones" || rawTipo === "entidades" ? rawTipo : "peliculas";
  const formato = p.get("formato") === "xlsx" ? "xlsx" : "csv";

  const session = await getSession();
  const gaz = await serverGazetteer();

  let films: Film[];
  let orgs: Org[];
  if (session && p.get("borradores") === "1") {
    const store = await adminStore();
    [films, orgs] = await Promise.all([store.listFilms({ drafts: true }), store.listOrgs({ drafts: true })]);
  } else {
    const d = await loadDataset();
    films = d.films;
    orgs = d.orgs;
  }

  const ff = parseFilmFilter(p);
  const of = parseOrgFilter(p);
  const table = buildTable(tipo, tipo === "entidades" ? [] : filterFilms(films, ff), tipo === "entidades" ? filterOrgs(orgs, of) : [], gaz, { film: ff, org: of });

  const deptoName = (c: number) => gaz.depto(c)?.name ?? String(c);
  const muniName = (c: number) => gaz.muni(c)?.name ?? String(c);
  const notes = tipo === "entidades" ? describeOrgFilter(of, deptoName) : describeFilmFilter(ff, deptoName, muniName);

  const today = new Date().toISOString().slice(0, 10);
  const slug = filterSlug(tipo, ff, of, gaz);
  const filename = `mapa-cine-gt-${table.name}${slug ? `-${slug}` : ""}-${today}.${formato}`;
  const headers = {
    "Content-Disposition": `attachment; filename="${filename}"`,
    "Cache-Control": "no-store",
    "X-Total-Rows": String(table.rows.length),
  };

  if (formato === "xlsx") {
    const buf = await toXlsx(table, notes);
    return new Response(new Uint8Array(buf), {
      headers: { ...headers, "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
    });
  }
  return new Response(toCsv(table), { headers: { ...headers, "Content-Type": "text/csv; charset=utf-8" } });
}
