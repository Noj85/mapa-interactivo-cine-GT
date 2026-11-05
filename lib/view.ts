import type { LayerId, MetricId } from "@/lib/types";
import { FILM_KINDS, LAYER_METRICS } from "@/lib/types";

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
  /** categoría del Atlas (Circulación e Industria) o tipo de obra (Producción) */
  cat: string | null;
  /** mostrando las producciones sin lugar de rodaje (el punto «Sin ubicación») */
  noloc: boolean;
}

export const DEFAULT_VIEW: ViewState = {
  layer: "produccion",
  metric: "films",
  place: null,
  film: null,
  org: null,
  cat: null,
  noloc: false,
};

const LAYERS = ["produccion", "circulacion", "industria"];

export function parseView(search: string): ViewState {
  const p = new URLSearchParams(search);
  const layer = (LAYERS.includes(p.get("capa") ?? "") ? p.get("capa") : "produccion") as LayerId;
  // Ya no hay selector de métrica: el mapa siempre usa la principal de la capa (un ?metrica= viejo se ignora).
  const metric: MetricId = LAYER_METRICS[layer][0];
  const lugar = p.get("lugar");
  let place: Place | null = null;
  if (lugar && /^[dm]\d+$/.test(lugar)) {
    place = { type: lugar[0] === "d" ? "depto" : "muni", code: Number(lugar.slice(1)) };
  }
  const rawCat = p.get("categoria");
  const cat = layer === "produccion" ? (FILM_KINDS.some((k) => k.id === rawCat) ? rawCat : null) : rawCat;
  const noloc = layer === "produccion" && p.get("sinlugar") === "1" && !place && !p.get("pelicula") && !p.get("entidad");
  return { layer, metric, place, film: p.get("pelicula"), org: p.get("entidad"), cat, noloc };
}

export function serializeView(v: ViewState): string {
  const p = new URLSearchParams();
  if (v.layer !== "produccion") p.set("capa", v.layer);
  if (v.place) p.set("lugar", (v.place.type === "depto" ? "d" : "m") + v.place.code);
  if (v.film) p.set("pelicula", v.film);
  if (v.org) p.set("entidad", v.org);
  if (v.cat) p.set("categoria", v.cat);
  if (v.noloc) p.set("sinlugar", "1");
  const s = p.toString();
  return s ? `?${s}` : "";
}

/** Enlace a /descargas con lo que se está viendo en el mapa ya filtrado. */
export function downloadHref(v: Pick<ViewState, "layer" | "place" | "cat">): string {
  const p = new URLSearchParams();
  p.set("tipo", v.layer === "produccion" ? "producciones" : v.layer === "circulacion" ? "circulacion" : "entidades");
  if (v.cat) p.set(v.layer === "produccion" ? "clase" : "categoria", v.cat);
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
