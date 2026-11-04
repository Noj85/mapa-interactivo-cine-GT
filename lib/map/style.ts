import type { StyleSpecification, LayerSpecification } from "maplibre-gl";
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

/**
 * Estilo base OpenFreeMap (Positron) adaptado: se retiran las etiquetas
 * que duplican las nuestras y, en tema oscuro, se invierte la luminosidad.
 */
export async function buildStyle(theme: Theme): Promise<StyleSpecification> {
  const style = await baseStyle();
  const layers: LayerSpecification[] = [];
  for (let l of style.layers) {
    if (HIDE.has(l.id)) continue;
    // la capital ya la rotulamos nosotros: evitar el duplicado "Guatemala City"
    if (l.id === "label_city_capital" && "filter" in l && l.filter) {
      l = { ...l, filter: ["all", l.filter, ["!=", ["coalesce", ["get", "name_en"], ["get", "name"]], "Guatemala City"]] } as LayerSpecification;
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
