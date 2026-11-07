import {
  EMPTY_FILM_FILTER,
  EMPTY_ORG_FILTER,
  filmFilterActive,
  legacyClase,
  filmFilterToParams,
  orgFilterActive,
  orgFilterToParams,
  parseFilmFilter,
  parseOrgFilter,
  type FilmFilter,
  type OrgFilter,
} from "@/lib/filters";
import type { LayerId, MetricId } from "@/lib/types";
import { LAYER_METRICS } from "@/lib/types";

export interface Place {
  type: "depto" | "muni";
  code: number;
}

export interface ViewState {
  layer: LayerId;
  metric: MetricId;
  place: Place | null;
  /** slug de producción seleccionada */
  film: string | null;
  /** slug de organización seleccionada */
  org: string | null;
  /** Filtros de Producción (solo se aplican con esa capa). El lugar lo maneja `place`, no el filtro. */
  filmFilter: FilmFilter;
  /** Filtros de entidades de Circulación e Industria (la capa la fija `layer`). */
  orgFilter: OrgFilter;
  /** mostrando las producciones sin lugar de rodaje (el punto «Sin locación») */
  noloc: boolean;
  /** mostrando las producciones rodadas fuera de Guatemala (la zona «Fuera de Guatemala») */
  abroad: boolean;
}

/** El mapa muestra por defecto solo las producciones con locación; «sin» y «todas» se piden con un chip. */
export const DEFAULT_FILM_FILTER: FilmFilter = { ...EMPTY_FILM_FILTER, locacion: "con" };

export const DEFAULT_VIEW: ViewState = {
  layer: "produccion",
  metric: "films",
  place: null,
  film: null,
  org: null,
  filmFilter: DEFAULT_FILM_FILTER,
  orgFilter: EMPTY_ORG_FILTER,
  noloc: false,
  abroad: false,
};

const LAYERS = ["produccion", "circulacion", "industria"];

export function parseView(search: string): ViewState {
  const p = new URLSearchParams(search);
  const layer = (LAYERS.includes(p.get("capa") ?? "") ? p.get("capa") : "produccion") as LayerId;
  const rawMetric = p.get("metrica") as MetricId | null;
  const metric: MetricId = rawMetric && LAYER_METRICS[layer].includes(rawMetric) ? rawMetric : LAYER_METRICS[layer][0];
  const lugar = p.get("lugar");
  let place: Place | null = null;
  if (lugar && /^[dm]\d+$/.test(lugar)) {
    place = { type: lugar[0] === "d" ? "depto" : "muni", code: Number(lugar.slice(1)) };
  }
  // Los filtros usan los mismos parámetros que /descargas; el lugar y la capa los fijan `lugar` y `capa`.
  // locación: sin parámetro es «con» (lo que sale por defecto); `sin` y `todas` se piden; ?sinlugar=1 (enlaces anteriores) abre «sin»
  const locParam = p.get("locacion");
  const locacion: FilmFilter["locacion"] = locParam === "sin" ? "sin" : locParam === "todas" ? null : locParam === "con" ? "con" : p.get("sinlugar") === "1" ? "sin" : "con";
  let filmFilter: FilmFilter = { ...EMPTY_FILM_FILTER, locacion };
  let orgFilter = EMPTY_ORG_FILTER;
  if (layer === "produccion") {
    filmFilter = { ...parseFilmFilter(p), depto: [], muni: [], locacion };
    // enlaces anteriores: ?categoria=ficcion era el tipo de obra
    const old = legacyClase([p.get("categoria") ?? ""]);
    if (!filmFilter.formato.length && !filmFilter.naturaleza.length) filmFilter = { ...filmFilter, formato: old.formato, naturaleza: old.naturaleza };
  } else {
    orgFilter = { ...parseOrgFilter(p), capa: null, depto: [] };
  }
  const noloc = layer === "produccion" && p.get("sinlugar") === "1" && !place && !p.get("pelicula") && !p.get("entidad");
  const abroad = layer === "produccion" && p.get("fuera") === "1" && !place && !noloc && !p.get("pelicula") && !p.get("entidad");
  return { layer, metric, place, film: p.get("pelicula"), org: p.get("entidad"), filmFilter, orgFilter, noloc, abroad };
}

export function serializeView(v: ViewState): string {
  const p = new URLSearchParams();
  if (v.layer !== "produccion") p.set("capa", v.layer);
  if (v.place) p.set("lugar", (v.place.type === "depto" ? "d" : "m") + v.place.code);
  if (v.film) p.set("pelicula", v.film);
  if (v.org) p.set("entidad", v.org);
  if (v.metric !== LAYER_METRICS[v.layer][0]) p.set("metrica", v.metric);
  if (v.layer === "produccion") filmFilterToParams({ ...v.filmFilter, depto: [], muni: [] }, p);
  else orgFilterToParams({ ...v.orgFilter, capa: null, depto: [] }, p);
  // «con» es lo normal y no se escribe; así el enlace de la capa de entidades también recuerda la elección
  p.delete("locacion");
  if (v.filmFilter.locacion === "sin") p.set("locacion", "sin");
  else if (v.filmFilter.locacion === null) p.set("locacion", "todas");
  if (v.noloc) p.set("sinlugar", "1");
  if (v.abroad) p.set("fuera", "1");
  const s = p.toString();
  return s ? `?${s}` : "";
}

/** Enlace a /descargas con lo que se está viendo en el mapa ya filtrado. */
export function downloadHref(v: Pick<ViewState, "layer" | "place" | "filmFilter" | "orgFilter">): string {
  const p = new URLSearchParams();
  p.set("tipo", v.layer === "produccion" ? "producciones" : v.layer === "circulacion" ? "circulacion" : "entidades");
  if (v.layer === "produccion") filmFilterToParams({ ...v.filmFilter, depto: [], muni: [] }, p);
  else orgFilterToParams({ ...v.orgFilter, capa: null, depto: [] }, p);
  if (v.place) {
    const depto = v.place.type === "depto" ? v.place.code : Math.floor(v.place.code / 100);
    p.set("depto", String(depto));
    if (v.place.type === "muni" && v.layer === "produccion") p.set("muni", String(v.place.code));
  }
  return `/descargas?${p.toString()}`;
}

/** Departamento (código INE) al que pertenece el lugar seleccionado; null si no hay. */
export function deptoOf(place: Place | null | undefined): number | null {
  if (!place) return null;
  return place.type === "depto" ? place.code : Math.floor(place.code / 100);
}

/** Cuántos filtros de la capa activa están en uso (para el botón «Filtros»). */
export function activeFilterCount(v: Pick<ViewState, "layer" | "filmFilter" | "orgFilter">): number {
  const params = v.layer === "produccion" ? filmFilterToParams({ ...v.filmFilter, depto: [], muni: [] }) : orgFilterToParams({ ...v.orgFilter, capa: null, depto: [] });
  // moneda es un ajuste del presupuesto, no un filtro aparte; la locación tiene su propio chip en el panel
  params.delete("moneda");
  params.delete("locacion");
  // presupuesto, año y demás rangos cuentan como un solo filtro cada uno
  const groups = new Set<string>();
  for (const k of params.keys()) groups.add(k.replace(/_(min|max)$/, "").replace(/^(desde|hasta)$/, "anio"));
  return groups.size;
}

export const hasActiveFilters = (v: Pick<ViewState, "layer" | "filmFilter" | "orgFilter">) =>
  v.layer === "produccion" ? filmFilterActive({ ...v.filmFilter, depto: [], muni: [] }) : orgFilterActive({ ...v.orgFilter, capa: null, depto: [] });
