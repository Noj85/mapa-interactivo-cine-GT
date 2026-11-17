import {
  EMPTY_FILM_FILTER,
  EMPTY_ORG_FILTER,
  EMPTY_PERSON_FILTER,
  filmFilterActive,
  legacyClase,
  filmFilterToParams,
  orgFilterActive,
  orgFilterToParams,
  parseFilmFilter,
  parseOrgFilter,
  parsePersonFilter,
  personFilterActive,
  personFilterToParams,
  type FilmFilter,
  type OrgFilter,
  type PersonFilter,
} from "@/lib/filters";
import type { IndustrySub, LayerId, MetricId } from "@/lib/types";
import { LAYER_METRICS } from "@/lib/types";

export interface Place {
  type: "depto" | "muni";
  code: number;
}

/** Métrica que el mapa mide en cada capa; en Industria → Personas cuenta personas. */
export const defaultMetric = (layer: LayerId, sub: IndustrySub = "entidad"): MetricId =>
  layer === "industria" && sub === "persona" ? "people" : LAYER_METRICS[layer][0];

export interface ViewState {
  layer: LayerId;
  /** Solo en Industria: entidades (lo de siempre) o personas del directorio. En las demás capas es «entidad» y no se usa. */
  sub: IndustrySub;
  metric: MetricId;
  place: Place | null;
  /** varios departamentos a la vez (desplegable con casillas); solo con 2 o más — con uno se usa `place` */
  deptos: number[];
  /** slug de producción seleccionada */
  film: string | null;
  /** slug de organización seleccionada */
  org: string | null;
  /** slug de la persona seleccionada (solo con Industria → Personas) */
  person: string | null;
  /** Filtros de Producción (solo se aplican con esa capa). El lugar lo maneja `place`, no el filtro. */
  filmFilter: FilmFilter;
  /** Filtros de entidades de Circulación e Industria (la capa la fija `layer`). */
  orgFilter: OrgFilter;
  /** Filtros de personas (oficio y búsqueda; el lugar lo maneja `place`). Solo con Industria → Personas. */
  personFilter: PersonFilter;
  /** mostrando las producciones sin lugar de rodaje (el punto «Sin locación») */
  noloc: boolean;
  /** mostrando las producciones rodadas fuera de Guatemala (la zona «Fuera de Guatemala») */
  abroad: boolean;
}

/** El mapa muestra por defecto solo las producciones con locación; «sin» y «todas» se piden con un chip. */
export const DEFAULT_FILM_FILTER: FilmFilter = { ...EMPTY_FILM_FILTER, locacion: "con" };

export const DEFAULT_VIEW: ViewState = {
  layer: "produccion",
  sub: "entidad",
  metric: "films",
  place: null,
  deptos: [],
  film: null,
  org: null,
  person: null,
  filmFilter: DEFAULT_FILM_FILTER,
  orgFilter: EMPTY_ORG_FILTER,
  personFilter: EMPTY_PERSON_FILTER,
  noloc: false,
  abroad: false,
};

const LAYERS = ["produccion", "circulacion", "industria"];

export function parseView(search: string): ViewState {
  const p = new URLSearchParams(search);
  const layer = (LAYERS.includes(p.get("capa") ?? "") ? p.get("capa") : "produccion") as LayerId;
  // Industria puede mostrar personas (?tipo=personas); en las otras capas ese parámetro no se usa
  const sub: IndustrySub = layer === "industria" && p.get("tipo") === "personas" ? "persona" : "entidad";
  // el mapa siempre mide la métrica principal de la capa (los enlaces con ?metrica= se abren igual)
  const metric: MetricId = defaultMetric(layer, sub);
  const lugar = p.get("lugar");
  let place: Place | null = null;
  if (lugar && /^[dm]\d+$/.test(lugar)) {
    place = { type: lugar[0] === "d" ? "depto" : "muni", code: Number(lugar.slice(1)) };
  }
  // ?deptos=1,7,9: varios departamentos; el lugar (?lugar=) manda si vienen los dos
  const deptos = place
    ? []
    : [...new Set((p.get("deptos") ?? "").split(",").map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= 22))].sort((a, b) => a - b);
  // Los filtros usan los mismos parámetros que /descargas; el lugar y la capa los fijan `lugar` y `capa`.
  // locación: sin parámetro es «con» (lo que sale por defecto); `sin` y `todas` se piden; ?sinlugar=1 (enlaces anteriores) abre «sin»
  const locParam = p.get("locacion");
  const locacion: FilmFilter["locacion"] = locParam === "sin" ? "sin" : locParam === "todas" ? null : locParam === "con" ? "con" : p.get("sinlugar") === "1" ? "sin" : "con";
  let filmFilter: FilmFilter = { ...EMPTY_FILM_FILTER, locacion };
  let orgFilter = EMPTY_ORG_FILTER;
  let personFilter = EMPTY_PERSON_FILTER;
  if (layer === "produccion") {
    filmFilter = { ...parseFilmFilter(p), depto: [], muni: [], locacion };
    // enlaces anteriores: ?categoria=ficcion era el tipo de obra
    const old = legacyClase([p.get("categoria") ?? ""]);
    if (!filmFilter.formato.length && !filmFilter.naturaleza.length) filmFilter = { ...filmFilter, formato: old.formato, naturaleza: old.naturaleza };
  } else if (sub === "persona") {
    personFilter = { ...parsePersonFilter(p), depto: [] };
  } else {
    orgFilter = { ...parseOrgFilter(p), capa: null, depto: [] };
  }
  const noloc = layer === "produccion" && p.get("sinlugar") === "1" && !place && deptos.length < 2 && !p.get("pelicula") && !p.get("entidad");
  const abroad = layer === "produccion" && p.get("fuera") === "1" && !place && deptos.length < 2 && !noloc && !p.get("pelicula") && !p.get("entidad");
  return {
    layer,
    sub,
    metric,
    place,
    deptos: deptos.length >= 2 ? deptos : [],
    film: p.get("pelicula"),
    // una entidad abierta no tiene sentido en la lista de personas, ni una persona en la de entidades
    org: sub === "persona" ? null : p.get("entidad"),
    person: sub === "persona" ? p.get("persona") : null,
    filmFilter,
    orgFilter,
    personFilter,
    noloc,
    abroad,
  };
}

export function serializeView(v: ViewState): string {
  const p = new URLSearchParams();
  if (v.layer !== "produccion") p.set("capa", v.layer);
  if (v.layer === "industria" && v.sub === "persona") p.set("tipo", "personas");
  if (v.place) p.set("lugar", (v.place.type === "depto" ? "d" : "m") + v.place.code);
  if (!v.place && v.deptos.length >= 2) p.set("deptos", v.deptos.join(","));
  if (v.film) p.set("pelicula", v.film);
  if (v.org) p.set("entidad", v.org);
  if (v.person) p.set("persona", v.person);
  if (v.metric !== defaultMetric(v.layer, v.sub)) p.set("metrica", v.metric);
  if (v.layer === "produccion") filmFilterToParams({ ...v.filmFilter, depto: [], muni: [] }, p);
  else if (v.sub === "persona") personFilterToParams({ ...v.personFilter, depto: [] }, p);
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
export function downloadHref(
  v: Pick<ViewState, "layer" | "place" | "filmFilter" | "orgFilter"> & { deptos?: number[]; sub?: IndustrySub; personFilter?: PersonFilter },
): string {
  const p = new URLSearchParams();
  const people = v.layer === "industria" && v.sub === "persona";
  p.set("tipo", v.layer === "produccion" ? "producciones" : v.layer === "circulacion" ? "circulacion" : people ? "personas" : "entidades");
  if (v.layer === "produccion") filmFilterToParams({ ...v.filmFilter, depto: [], muni: [] }, p);
  else if (people) personFilterToParams({ ...(v.personFilter ?? EMPTY_PERSON_FILTER), depto: [] }, p);
  else orgFilterToParams({ ...v.orgFilter, capa: null, depto: [] }, p);
  if (v.place) {
    const depto = v.place.type === "depto" ? v.place.code : Math.floor(v.place.code / 100);
    p.set("depto", String(depto));
    if (v.place.type === "muni" && v.layer === "produccion") p.set("muni", String(v.place.code));
  } else if (v.deptos && v.deptos.length >= 2) p.set("depto", v.deptos.join(","));
  return `/descargas?${p.toString()}`;
}

/** Departamento (código INE) al que pertenece el lugar seleccionado; null si no hay. */
export function deptoOf(place: Place | null | undefined): number | null {
  if (!place) return null;
  return place.type === "depto" ? place.code : Math.floor(place.code / 100);
}

/** Departamentos que el desplegable tiene marcados: la lista múltiple o el del lugar elegido. */
export function selectedDeptos(v: Pick<ViewState, "place" | "deptos">): number[] {
  if (v.deptos.length) return v.deptos;
  const d = deptoOf(v.place);
  return d == null ? [] : [d];
}

/** Cuántos filtros de la capa activa están en uso (para el botón «Filtros»). */
export function activeFilterCount(v: Pick<ViewState, "layer" | "filmFilter" | "orgFilter"> & { sub?: IndustrySub; personFilter?: PersonFilter }): number {
  const params =
    v.layer === "produccion"
      ? filmFilterToParams({ ...v.filmFilter, depto: [], muni: [] })
      : v.layer === "industria" && v.sub === "persona"
        ? personFilterToParams({ ...(v.personFilter ?? EMPTY_PERSON_FILTER), depto: [] })
        : orgFilterToParams({ ...v.orgFilter, capa: null, depto: [] });
  // moneda es un ajuste del presupuesto, no un filtro aparte; la locación tiene su propio chip en el panel
  params.delete("moneda");
  params.delete("locacion");
  // presupuesto, año y demás rangos cuentan como un solo filtro cada uno
  const groups = new Set<string>();
  for (const k of params.keys()) groups.add(k.replace(/_(min|max)$/, "").replace(/^(desde|hasta)$/, "anio"));
  return groups.size;
}

export const hasActiveFilters = (v: Pick<ViewState, "layer" | "filmFilter" | "orgFilter"> & { sub?: IndustrySub; personFilter?: PersonFilter }) =>
  v.layer === "produccion"
    ? filmFilterActive({ ...v.filmFilter, depto: [], muni: [] })
    : v.layer === "industria" && v.sub === "persona"
      ? personFilterActive({ ...(v.personFilter ?? EMPTY_PERSON_FILTER), depto: [] })
      : orgFilterActive({ ...v.orgFilter, capa: null, depto: [] });
