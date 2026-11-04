import type { FeatureCollection, GeometryCollection, MultiPolygon, Polygon } from "geojson";
import { Gazetteer } from "@/lib/geo/gazetteer";
import type { GazetteerEntry } from "@/lib/types";

export type PolyCollection = FeatureCollection<Polygon | MultiPolygon, Record<string, unknown>>;

export interface GeoBundle {
  depto: PolyCollection;
  muni: PolyCollection;
  pais: GeometryCollection;
  gaz: Gazetteer;
}

let pending: Promise<GeoBundle> | null = null;

/** Carga (una sola vez) la geografía estática de /public/geo. */
export function loadGeo(): Promise<GeoBundle> {
  if (pending) return pending;
  const get = async <T,>(u: string) => {
    const r = await fetch(u);
    if (!r.ok) throw new Error(`No se pudo cargar ${u}`);
    return (await r.json()) as T;
  };
  pending = Promise.all([
    get<PolyCollection>("/geo/departamentos.geojson"),
    get<PolyCollection>("/geo/municipios.geojson"),
    get<GeometryCollection>("/geo/pais.geojson"),
    get<GazetteerEntry[] | { entries: GazetteerEntry[] }>("/geo/gazetteer.json"),
  ]).then(([depto, muni, pais, g]) => ({
    depto,
    muni,
    pais,
    gaz: new Gazetteer(Array.isArray(g) ? g : g.entries),
  }));
  pending.catch(() => (pending = null));
  return pending;
}
