import { isAbroad } from "@/lib/completeness";
import { FORMATS, NATURES } from "@/lib/film-types";
import { FESTIVAL_RESULTS, INITIATIVE_TYPES, NATIONALITIES, type Film, type Org } from "@/lib/types";
import { planFilmUpdate, planOrgUpdate, type PlaceNames } from "./diff";
import type { Candidate } from "./types";

/**
 * Tabla normalizada: lo que se entendió del archivo, ordenado con las columnas que usa el sistema para
 * Producción, Circulación e Industria. Se muestra en la revisión y se puede bajar como Excel; sus encabezados
 * son los que la carga reconoce sola, así que ese mismo Excel se puede volver a cargar sin ajustes.
 */

export type Cell = string | number | null;

export interface NormalizedTable {
  id: "produccion" | "festivales" | "circulacion" | "industria";
  /** Nombre de la hoja en el Excel. */
  title: string;
  headers: string[];
  rows: Cell[][];
}

export const ORIGIN_HEADER = "Origen (filas del archivo)";
export const STATE_HEADER = "Estado de la carga";

const FILM_HEADERS = [
  "Título", "Año", "Formato", "Naturaleza", "Géneros", "Duración (min)", "Director/a", "Productor/a",
  "Director/a de fotografía", "Guionista", "Casa productora", "País de la casa productora", "Nacionalidad",
  "Presupuesto", "Moneda", "Sinopsis", "Póster (enlace)", "Tráiler (enlace)", "Película completa (enlace)",
  "Lugar (texto libre)", "Departamento", "Municipio", "Sitio de rodaje", "Latitud", "Longitud",
  "Días de rodaje", "Inversión local", "Empleos",
];
const FESTIVAL_HEADERS = ["Título", "Año", "Director/a", "Festival", "Año del festival", "Resultado en el festival", "Sección del festival", "Premio", "Enlace del festival o premio"];
const ORG_HEADERS = [
  "Nombre", "Categoría", "Tipo de iniciativa", "Departamento", "Municipio", "Ciudad o referencia", "Latitud", "Longitud",
  "Sitio web", "Instagram", "Contacto", "Descripción", "Logo (enlace)",
];

const label = <T extends { id: string; label: string }>(list: T[], id: string | null | undefined) => (id ? (list.find((x) => x.id === id)?.label ?? id) : null);
const orNull = (v: unknown): Cell => (v === null || v === undefined || v === "" ? null : (v as Cell));
const rowsText = (rows: (string | number)[]) => `${rows.length > 1 ? "Filas" : "Fila"} ${rows.slice(0, 8).join(", ")}${rows.length > 8 ? "…" : ""}`;

/** Qué va a pasar con el renglón al confirmar (texto corto para la columna «Estado de la carga»). */
export function candidateState(c: Candidate, names?: PlaceNames): string | null {
  if (!c.include || c.decision === "skip") return null;
  if (c.decision === "review") return "Dudoso: se envía a Aportes";
  const rec = c.duplicate?.record;
  if (c.duplicate && c.decision !== "create") {
    const plan = !rec ? null : c.type === "film" && c.film ? planFilmUpdate(rec as Film, c.film, names) : c.org ? planOrgUpdate(rec as Org, c.org, names) : null;
    const conflicts = plan?.items.filter((i) => i.group === "conflict").length ?? 0;
    const news = plan?.news ?? 0;
    const parts = [news > 0 ? `Completa «${c.duplicate.title}»` : `Sin cambios en «${c.duplicate.title}»`];
    if (conflicts) parts.push(`${conflicts} ${conflicts === 1 ? "diferencia" : "diferencias"} a Aportes`);
    return parts.join(" · ");
  }
  return "Nuevo";
}

function locationCells(l: Record<string, any> | undefined, names?: PlaceNames): Cell[] {
  // [Lugar (texto libre), Departamento, Municipio, Sitio, Latitud, Longitud, Días, Inversión, Empleos]
  if (!l) return [null, null, null, null, null, null, null, null, null];
  const abroad = isAbroad(l);
  const place = abroad ? [l.city, l.country].filter(Boolean).join(", ") : null;
  const depto = !abroad && l.depto_ine != null ? names?.depto?.(l.depto_ine) || null : null;
  const muni = !abroad && l.muni_ine != null ? names?.muni?.(l.muni_ine) || null : null;
  return [orNull(place), orNull(depto), orNull(muni), orNull(l.site), orNull(l.lat), orNull(l.lng), orNull(l.days), orNull(l.local_spend), orNull(l.jobs)];
}

export function normalizedTables(candidates: Candidate[], names?: PlaceNames): NormalizedTable[] {
  const films: NormalizedTable = { id: "produccion", title: "Producción", headers: [...FILM_HEADERS, ORIGIN_HEADER, STATE_HEADER], rows: [] };
  const fests: NormalizedTable = { id: "festivales", title: "Festivales", headers: [...FESTIVAL_HEADERS, ORIGIN_HEADER, STATE_HEADER], rows: [] };
  const circ: NormalizedTable = { id: "circulacion", title: "Circulación", headers: [...ORG_HEADERS, ORIGIN_HEADER, STATE_HEADER], rows: [] };
  const ind: NormalizedTable = { id: "industria", title: "Industria", headers: [...ORG_HEADERS, ORIGIN_HEADER, STATE_HEADER], rows: [] };

  for (const c of candidates) {
    const state = candidateState(c, names);
    if (!state) continue;
    const origin = rowsText(c.rows);

    if (c.type === "film" && c.film) {
      const f = c.film;
      const companies = (f.companies ?? []).map((x) => (x.country ? `${x.name} (${x.country})` : x.name)).filter(Boolean);
      const base = (): Cell[] => [
        f.title, orNull(f.year), orNull(label(FORMATS, f.format)), orNull(label(NATURES, f.nature)), orNull((f.genres ?? []).join("; ")),
        orNull(f.duration_min), orNull(f.director), orNull(f.producer), orNull(f.cinematographer), orNull(f.screenwriter),
        orNull(companies.join("; ")), null, orNull(label(NATIONALITIES, f.nationality)),
        orNull(f.budget), orNull(f.budget != null ? f.currency : null), orNull(f.synopsis), orNull(f.poster_url), orNull(f.trailer_url), orNull(f.film_url),
      ];
      const locs = f.locations?.length ? f.locations : [undefined];
      for (const l of locs) films.rows.push([...base(), ...locationCells(l, names), origin, state]);
      for (const fe of f.festivals ?? []) {
        if (!fe.name) continue;
        fests.rows.push([f.title, orNull(f.year), orNull(f.director), fe.name, orNull(fe.year), orNull(label(FESTIVAL_RESULTS, fe.result)), orNull(fe.section), orNull(fe.award), orNull(fe.url), origin, state]);
      }
    } else if (c.type === "org" && c.org) {
      const o = c.org;
      const [, depto, muni] = locationCells({ depto_ine: o.depto_ine, muni_ine: o.muni_ine }, names);
      const cats = o.categories?.length ? o.categories : [o.category];
      const table = o.layer === "industria" ? ind : circ;
      table.rows.push([
        o.name, orNull(cats.filter(Boolean).join("; ")), orNull(label(INITIATIVE_TYPES, o.initiative_type)), depto, muni, orNull(o.city),
        orNull(o.lat), orNull(o.lng), orNull(o.web), orNull(o.instagram), orNull(o.contact), orNull(o.description), orNull(o.logo_url), origin, state,
      ]);
    }
  }
  return [films, fests, circ, ind].filter((t) => t.rows.length > 0);
}

/** Crea y descarga el Excel normalizado (una hoja por tabla). Solo en el navegador. */
export async function downloadNormalized(tables: NormalizedTable[], filename: string) {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  for (const t of tables) {
    const ws = XLSX.utils.aoa_to_sheet([t.headers, ...t.rows]);
    ws["!cols"] = t.headers.map((h, i) => ({ wch: Math.min(40, Math.max(h.length + 2, ...t.rows.slice(0, 50).map((r) => String(r[i] ?? "").length + 2))) }));
    XLSX.utils.book_append_sheet(wb, ws, t.title);
  }
  const base = filename.replace(/\.[^.]+$/, "").replace(/[^\w\- ]+/g, "").trim() || "carga";
  XLSX.writeFile(wb, `${base} - normalizado.xlsx`);
}
