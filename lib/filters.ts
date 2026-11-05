import { orgCategories } from "@/lib/categories";
import { CIRC_CATEGORIES, FILM_KINDS, IND_CATEGORIES, INITIATIVE_TYPES, NATIONALITIES, type Film, type FilmKind, type InitiativeType, type Nationality, type Org } from "@/lib/types";

/**
 * Filtros de descarga. Se leen de la URL, de modo que un enlace como
 *   /api/export?tipo=producciones&depto=7&presupuesto_min=500000&formato=xlsx
 * funciona igual desde la página de descargas, un correo o un script.
 */

/** Tipo de cambio de referencia para comparar presupuestos en monedas distintas. */
export const USD_TO_GTQ = 7.7;

/** Las tres categorías de descarga: producciones, entidades de circulación y entidades de industria. */
export type ExportKind = "producciones" | "circulacion" | "entidades";
/** Qué es una fila en las producciones: una por producción o una por locación de rodaje. */
export type ExportRows = "producciones" | "locaciones";
export type ExportFormat = "csv" | "xlsx";
export type BudgetCurrency = "GTQ" | "USD";

export interface FilmFilter {
  /** Códigos INE de departamento: basta con que una locación esté ahí. */
  depto: number[];
  muni: number[];
  clase: FilmKind[];
  nacionalidad: Nationality[];
  desde: number | null;
  hasta: number | null;
  presupuestoMin: number | null;
  presupuestoMax: number | null;
  moneda: BudgetCurrency;
  q: string;
  /** Solo producciones con todas las locaciones ubicadas en un municipio. */
  soloCompletas: boolean;
}

export interface OrgFilter {
  capa: "circulacion" | "industria" | null;
  categoria: string[];
  iniciativa: InitiativeType[];
  depto: number[];
  q: string;
}

export const EMPTY_FILM_FILTER: FilmFilter = {
  depto: [],
  muni: [],
  clase: [],
  nacionalidad: [],
  desde: null,
  hasta: null,
  presupuestoMin: null,
  presupuestoMax: null,
  moneda: "GTQ",
  q: "",
  soloCompletas: false,
};

export const EMPTY_ORG_FILTER: OrgFilter = { capa: null, categoria: [], iniciativa: [], depto: [], q: "" };

// ───────────────────────── lectura y escritura en la URL ─────────────────────────

const list = (p: URLSearchParams, key: string) =>
  (p.get(key) ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

const nums = (p: URLSearchParams, key: string) => list(p, key).map(Number).filter((n) => Number.isInteger(n) && n > 0);

const num = (p: URLSearchParams, key: string) => {
  const raw = (p.get(key) ?? "").replace(/[\s,_]/g, "").trim();
  if (raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
};

const pick = <T extends string>(values: string[], allowed: readonly { id: T }[]): T[] =>
  values.filter((v): v is T => allowed.some((a) => a.id === v));

/** Capa de las entidades de cada categoría de descarga (las producciones no tienen). */
export const kindLayer = (k: ExportKind): "circulacion" | "industria" | null => (k === "circulacion" ? "circulacion" : k === "entidades" ? "industria" : null);

/**
 * Qué se pide: `tipo` (producciones | circulacion | entidades) y, en producciones, `filas` (producciones | locaciones).
 * Entiende también los enlaces anteriores: tipo=peliculas, tipo=locaciones y tipo=entidades&capa=circulacion.
 */
export function parseExportRequest(p: URLSearchParams): { tipo: ExportKind; filas: ExportRows } {
  const t = p.get("tipo");
  if (t === "circulacion") return { tipo: "circulacion", filas: "producciones" };
  if (t === "entidades") return { tipo: p.get("capa") === "circulacion" ? "circulacion" : "entidades", filas: "producciones" };
  if (t === "locaciones") return { tipo: "producciones", filas: "locaciones" };
  return { tipo: "producciones", filas: p.get("filas") === "locaciones" ? "locaciones" : "producciones" };
}

export function parseFilmFilter(p: URLSearchParams): FilmFilter {
  return {
    depto: nums(p, "depto"),
    muni: nums(p, "muni"),
    clase: pick(list(p, "clase"), FILM_KINDS),
    nacionalidad: pick(list(p, "nacionalidad"), NATIONALITIES),
    desde: num(p, "desde"),
    hasta: num(p, "hasta"),
    presupuestoMin: num(p, "presupuesto_min"),
    presupuestoMax: num(p, "presupuesto_max"),
    moneda: p.get("moneda") === "USD" ? "USD" : "GTQ",
    q: (p.get("q") ?? "").trim().slice(0, 120),
    soloCompletas: p.get("completas") === "1",
  };
}

export function parseOrgFilter(p: URLSearchParams): OrgFilter {
  const capa = p.get("capa");
  return {
    capa: capa === "circulacion" || capa === "industria" ? capa : null,
    categoria: list(p, "categoria"),
    iniciativa: pick(list(p, "iniciativa"), INITIATIVE_TYPES),
    depto: nums(p, "depto"),
    q: (p.get("q") ?? "").trim().slice(0, 120),
  };
}

export function filmFilterToParams(f: FilmFilter, into = new URLSearchParams()) {
  if (f.depto.length) into.set("depto", f.depto.join(","));
  if (f.muni.length) into.set("muni", f.muni.join(","));
  if (f.clase.length) into.set("clase", f.clase.join(","));
  if (f.nacionalidad.length) into.set("nacionalidad", f.nacionalidad.join(","));
  if (f.desde != null) into.set("desde", String(f.desde));
  if (f.hasta != null) into.set("hasta", String(f.hasta));
  if (f.presupuestoMin != null) into.set("presupuesto_min", String(f.presupuestoMin));
  if (f.presupuestoMax != null) into.set("presupuesto_max", String(f.presupuestoMax));
  if ((f.presupuestoMin != null || f.presupuestoMax != null) && f.moneda !== "GTQ") into.set("moneda", f.moneda);
  if (f.q) into.set("q", f.q);
  if (f.soloCompletas) into.set("completas", "1");
  return into;
}

export function orgFilterToParams(f: OrgFilter, into = new URLSearchParams()) {
  if (f.capa) into.set("capa", f.capa);
  if (f.categoria.length) into.set("categoria", f.categoria.join(","));
  if (f.iniciativa.length) into.set("iniciativa", f.iniciativa.join(","));
  if (f.depto.length) into.set("depto", f.depto.join(","));
  if (f.q) into.set("q", f.q);
  return into;
}

// ───────────────────────── aplicación ─────────────────────────

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

/** El departamento de una locación: el guardado o, si falta, el que sale del código del municipio. */
export const locDepto = (l: { depto_ine: number | null; muni_ine: number | null }) => l.depto_ine ?? (l.muni_ine != null ? Math.floor(l.muni_ine / 100) : null);

/** Presupuesto expresado en la moneda del filtro (con el tipo de cambio de referencia). */
export function budgetIn(film: Pick<Film, "budget" | "currency">, to: BudgetCurrency): number | null {
  if (film.budget == null) return null;
  if (film.currency === to) return film.budget;
  return to === "GTQ" ? film.budget * USD_TO_GTQ : film.budget / USD_TO_GTQ;
}

export function filmMatches(f: Film, flt: FilmFilter): boolean {
  if (flt.clase.length && (!f.kind || !flt.clase.includes(f.kind))) return false;
  if (flt.nacionalidad.length && (!f.nationality || !flt.nacionalidad.includes(f.nationality))) return false;
  if (flt.desde != null && (f.year == null || f.year < flt.desde)) return false;
  if (flt.hasta != null && (f.year == null || f.year > flt.hasta)) return false;
  if (flt.depto.length && !f.locations.some((l) => flt.depto.includes(locDepto(l) ?? -1))) return false;
  if (flt.muni.length && !f.locations.some((l) => l.muni_ine != null && flt.muni.includes(l.muni_ine))) return false;
  if (flt.presupuestoMin != null || flt.presupuestoMax != null) {
    const b = budgetIn(f, flt.moneda);
    if (b == null) return false;
    if (flt.presupuestoMin != null && b < flt.presupuestoMin) return false;
    if (flt.presupuestoMax != null && b > flt.presupuestoMax) return false;
  }
  if (flt.soloCompletas && !(f.locations.length > 0 && f.locations.every((l) => l.muni_ine != null))) return false;
  if (flt.q && !norm(`${f.title} ${f.director ?? ""} ${f.producer ?? ""}`).includes(norm(flt.q))) return false;
  return true;
}

export function orgMatches(o: Org, flt: OrgFilter): boolean {
  if (flt.capa && o.layer !== flt.capa) return false;
  if (flt.categoria.length && !orgCategories(o).some((c) => flt.categoria.includes(c))) return false;
  if (flt.iniciativa.length && (!o.initiative_type || !flt.iniciativa.includes(o.initiative_type))) return false;
  if (flt.depto.length) {
    const d = o.depto_ine ?? (o.muni_ine != null ? Math.floor(o.muni_ine / 100) : null);
    if (d == null || !flt.depto.includes(d)) return false;
  }
  if (flt.q && !norm(`${o.name} ${orgCategories(o).join(" ")} ${o.description ?? ""}`).includes(norm(flt.q))) return false;
  return true;
}

/** Locaciones de una producción que cumplen el filtro de lugar (si no hay filtro de lugar, todas). */
export const locationsMatching = <L extends { depto_ine: number | null; muni_ine: number | null }>(locs: L[], f: Pick<FilmFilter, "depto" | "muni">): L[] =>
  locs.filter((l) => (!f.depto.length || f.depto.includes(locDepto(l) ?? -1)) && (!f.muni.length || (l.muni_ine != null && f.muni.includes(l.muni_ine))));

export const filterFilms = (films: Film[], f: FilmFilter) => films.filter((x) => filmMatches(x, f));
export const filterOrgs = (orgs: Org[], f: OrgFilter) => orgs.filter((x) => orgMatches(x, f));

/** Categorías conocidas por capa, para los selectores. */
export const ORG_CATEGORIES: Record<"circulacion" | "industria", readonly string[]> = {
  circulacion: CIRC_CATEGORIES,
  industria: IND_CATEGORIES,
};

// ───────────────────────── descripción legible ─────────────────────────

const money = (n: number, c: BudgetCurrency) => `${c === "USD" ? "US$" : "Q"} ${Math.round(n).toLocaleString("es-GT")}`;

/** Frases cortas con los filtros activos (para chips, el Léeme del xlsx y los nombres de archivo). */
export function describeFilmFilter(f: FilmFilter, deptoName: (code: number) => string, muniName: (code: number) => string): string[] {
  const out: string[] = [];
  if (f.depto.length) out.push(`Departamento: ${f.depto.map(deptoName).join(", ")}`);
  if (f.muni.length) out.push(`Municipio: ${f.muni.map(muniName).join(", ")}`);
  if (f.clase.length) out.push(`Tipo: ${f.clase.map((c) => FILM_KINDS.find((k) => k.id === c)?.label ?? c).join(", ")}`);
  if (f.nacionalidad.length) out.push(`Nacionalidad: ${f.nacionalidad.map((c) => NATIONALITIES.find((k) => k.id === c)?.label ?? c).join(", ")}`);
  if (f.desde != null || f.hasta != null) out.push(`Año: ${f.desde ?? "…"} a ${f.hasta ?? "…"}`);
  if (f.presupuestoMin != null && f.presupuestoMax != null) out.push(`Presupuesto entre ${money(f.presupuestoMin, f.moneda)} y ${money(f.presupuestoMax, f.moneda)}`);
  else if (f.presupuestoMin != null) out.push(`Presupuesto de ${money(f.presupuestoMin, f.moneda)} o más`);
  else if (f.presupuestoMax != null) out.push(`Presupuesto de ${money(f.presupuestoMax, f.moneda)} o menos`);
  if (f.soloCompletas) out.push("Solo con todas las locaciones ubicadas en un municipio");
  if (f.q) out.push(`Búsqueda: “${f.q}”`);
  return out;
}

export function describeOrgFilter(f: OrgFilter, deptoName: (code: number) => string): string[] {
  const out: string[] = [];
  if (f.capa) out.push(`Capa: ${f.capa === "circulacion" ? "Circulación" : "Industria"}`);
  if (f.categoria.length) out.push(`Categoría: ${f.categoria.join(", ")}`);
  if (f.iniciativa.length) out.push(`Naturaleza: ${f.iniciativa.map((c) => INITIATIVE_TYPES.find((k) => k.id === c)?.label ?? c).join(", ")}`);
  if (f.depto.length) out.push(`Departamento: ${f.depto.map(deptoName).join(", ")}`);
  if (f.q) out.push(`Búsqueda: “${f.q}”`);
  return out;
}

export const filmFilterActive = (f: FilmFilter) => Array.from(filmFilterToParams(f).keys()).length > 0;
export const orgFilterActive = (f: OrgFilter) => Array.from(orgFilterToParams(f).keys()).length > 0;
