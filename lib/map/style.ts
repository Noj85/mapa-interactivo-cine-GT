import type { StyleSpecification, LayerSpecification } from "maplibre-gl";
import type { GeometryCollection, MultiPolygon } from "geojson";
import { darkenExpr, type Theme } from "./colors";

const STYLE_URL = "https://tiles.openfreemap.org/styles/positron";

let cache: StyleSpecification | null = null;

async function baseStyle(): Promise<StyleSpecification> {
  if (cache) return structuredClone(cache);
  const res = await fetch(STYLE_URL);
  if (!res.ok) throw new Error("No se pudo cargar el estilo base");
  cache = (await res.json()) as StyleSpecification;
  return structuredClone(cache);
}

/** Etiquetas del mapa base que sustituimos por las propias (departamentos y municipios). */
const HIDE = new Set(["label_state", "label_village", "label_town", "label_other", "label_city"]);

/** Contorno de Guatemala como un solo MultiPolygon (con 3 decimales, unos 100 m, para que el filtro pese poco). */
export function countryShape(pais: GeometryCollection): MultiPolygon {
  const r = (n: number) => Math.round(n * 1000) / 1000;
  const coordinates: MultiPolygon["coordinates"] = [];
  for (const g of pais.geometries) {
    if (g.type !== "Polygon" && g.type !== "MultiPolygon") continue;
    for (const poly of g.type === "Polygon" ? [g.coordinates] : g.coordinates) coordinates.push(poly.map((ring) => ring.map(([x, y]) => [r(x), r(y)])));
  }
  return { type: "MultiPolygon", coordinates };
}

/**
 * Estilo base OpenFreeMap (Positron) adaptado: se retiran las etiquetas
 * que duplican las nuestras (salvo con `labels`) y, en tema oscuro, se invierte la luminosidad.
 * Con `within` (el contorno del país) solo se rotula lo que está dentro: nada de países vecinos, mares ni carreteras de afuera.
 */
export async function buildStyle(theme: Theme, opts: { labels?: boolean; within?: MultiPolygon } = {}): Promise<StyleSpecification> {
  const style = await baseStyle();
  const layers: LayerSpecification[] = [];
  for (let l of style.layers) {
    // con `labels` se conservan los nombres de ciudades, pueblos y aldeas del mapa base (selector de punto)
    if (!opts.labels && HIDE.has(l.id)) continue;
    // la capital ya la rotulamos nosotros: evitar el duplicado "Guatemala City"
    if (l.id === "label_city_capital" && "filter" in l && l.filter) {
      l = { ...l, filter: ["all", l.filter, ["!=", ["coalesce", ["get", "name_en"], ["get", "name"]], "Guatemala City"]] } as LayerSpecification;
    }
    if (opts.within && l.type === "symbol") {
      // nombres de países: ninguno; el resto de rótulos (lagos, carreteras, aeropuertos) solo dentro de Guatemala
      if (l.id.startsWith("label_country")) continue;
      const inside = ["within", opts.within];
      l = { ...l, filter: "filter" in l && l.filter ? ["all", l.filter, inside] : inside } as LayerSpecification;
    }
    if (theme === "dark") {
      const n = { ...l } as Record<string, unknown>;
      if (l.paint) n.paint = darkenExpr(l.paint);
      layers.push(n as unknown as LayerSpecification);
    } else layers.push(l);
  }
  style.layers = layers;
  return style;
}

/** Primer id de capa de símbolos: las capas temáticas se insertan debajo. */
export function firstSymbolId(style: StyleSpecification): string | undefined {
  return style.layers.find((l) => l.type === "symbol")?.id;
}
