import { adminStore, getSession } from "@/lib/auth";
import { loadDatasetCached } from "@/lib/data/load";
import { buildTable, filterSlug, toCsv, toXlsx } from "@/lib/export";
import { describeFilmFilter, describeOrgFilter, filterFilms, filterOrgs, kindLayer, parseExportRequest, parseFilmFilter, parseOrgFilter } from "@/lib/filters";
import { serverGazetteer } from "@/lib/geo/server";
import type { Film, Org } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Descarga de datos, abierta a cualquier persona (solo lo publicado).
 *
 *  tipo       producciones (por defecto) | circulacion | entidades (la capa de industria)
 *  filas      solo en producciones: producciones (por defecto) | locaciones (una fila por lugar de rodaje) | festivales (una fila por participación)
 *             Los enlaces anteriores siguen funcionando: tipo=peliculas, tipo=locaciones y tipo=entidades&capa=circulacion.
 *  formato    csv (por defecto) | xlsx
 *
 *  Filtros de producciones:
 *    depto=7,1            códigos INE de departamento (al menos una locación ahí)
 *    muni=101             códigos INE de municipio
 *    formato_obra=largometraje,cortometraje  formato de la obra
 *    naturaleza=ficcion,documental,hibrido
 *    genero=Drama,Terror  (basta con uno)
 *    clase=ficcion,corto  (enlaces anteriores: se convierte a formato y naturaleza)
 *    nacionalidad=guatemalteca,coproduccion
 *    desde=2010&hasta=2024
 *    presupuesto_min=500000&presupuesto_max=2000000&moneda=GTQ|USD
 *    dias_min / dias_max, inversion_min / inversion_max, empleos_min / empleos_max
 *                         totales de rodaje de la producción (suma de sus locaciones)
 *    q=texto              título, dirección o productora
 *
 *  Filtros de circulación y entidades:
 *    categoria=Festivales,Productoras
 *    iniciativa=publica,privada
 *    depto=… y q=…
 *
 *  borradores=1 incluye borradores (solo con sesión del equipo).
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const p = url.searchParams;
  const { tipo, filas } = parseExportRequest(p);
  const formato = p.get("formato") === "xlsx" ? "xlsx" : "csv";

  const session = await getSession();
  const gaz = await serverGazetteer();

  let films: Film[];
  let orgs: Org[];
  if (session && p.get("borradores") === "1") {
    const store = await adminStore();
    [films, orgs] = await Promise.all([store.listFilms({ drafts: true }), store.listOrgs({ drafts: true })]);
  } else {
    const d = await loadDatasetCached();
    films = d.films;
    orgs = d.orgs;
  }

  const ff = parseFilmFilter(p);
  // la capa de las entidades la define la categoría de descarga, no un filtro
  const of = { ...parseOrgFilter(p), capa: kindLayer(tipo) };
  const isOrgs = tipo !== "producciones";
  const table = buildTable(tipo, filas, isOrgs ? [] : filterFilms(films, ff), isOrgs ? filterOrgs(orgs, of) : [], gaz, { film: ff, org: of });

  const deptoName = (c: number) => gaz.depto(c)?.name ?? String(c);
  const muniName = (c: number) => gaz.muni(c)?.name ?? String(c);
  const notes = isOrgs ? describeOrgFilter({ ...of, capa: null }, deptoName) : describeFilmFilter(ff, deptoName, muniName);

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
