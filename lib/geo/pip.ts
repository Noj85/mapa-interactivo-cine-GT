import type { Feature, MultiPolygon, Polygon } from "geojson";
import type { Gazetteer } from "@/lib/geo/gazetteer";
import type { PolyCollection } from "@/lib/geo/load";

function inRing(x: number, y: number, ring: number[][]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function inPolygon(x: number, y: number, poly: number[][][]) {
  if (!inRing(x, y, poly[0])) return false;
  for (let k = 1; k < poly.length; k++) if (inRing(x, y, poly[k])) return false;
  return true;
}

/** Municipio que contiene un punto (o null si cae fuera de los límites). */
export function municipalityAt(lng: number, lat: number, muni: PolyCollection, gaz: Gazetteer): number | null {
  const near = gaz.entries.filter(
    (e) => e.type === "muni" && lng >= e.bbox[0] && lng <= e.bbox[2] && lat >= e.bbox[1] && lat <= e.bbox[3],
  );
  const ids = new Set(near.map((e) => e.code));
  for (const f of muni.features as Feature<Polygon | MultiPolygon>[]) {
    if (!ids.has(Number(f.id))) continue;
    const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
    if (polys.some((p) => inPolygon(lng, lat, p))) return Number(f.id);
  }
  return null;
}
