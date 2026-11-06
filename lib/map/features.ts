import { categoriesText } from "@/lib/categories";
import type { Feature, FeatureCollection, GeometryCollection, LineString, Point, Polygon } from "geojson";
import type { Agg, Aggregates } from "@/lib/aggregate";
import { buildStops, levelOf, metricValue } from "@/lib/aggregate";
import { metricText } from "@/lib/format";
import { hasPlace, isAbroad, isUnlocated } from "@/lib/completeness";
import type { Gazetteer } from "@/lib/geo/gazetteer";
import type { Dataset, Film, LayerId, MetricId } from "@/lib/types";

type Pt = Feature<Point, Record<string, unknown>>;

/** Posición de una locación: coordenadas exactas, o centro del municipio/depto (aproximada). */
export function locationPoint(
  l: { lat: number | null; lng: number | null; muni_ine: number | null; depto_ine: number | null },
  gaz: Gazetteer,
): { lng: number; lat: number; approx: boolean } | null {
  if (l.lat != null && l.lng != null) return { lng: l.lng, lat: l.lat, approx: false };
  const e = gaz.muni(l.muni_ine) ?? gaz.depto(l.depto_ine);
  if (!e) return null;
  return { lng: e.center[0], lat: e.center[1], approx: true };
}

/** Dispersa en espiral los puntos que caen en el mismo lugar para poder distinguirlos. */
function spread(points: { lng: number; lat: number }[]) {
  const seen = new Map<string, number>();
  return points.map((p) => {
    const key = `${p.lng.toFixed(3)},${p.lat.toFixed(3)}`;
    const i = seen.get(key) ?? 0;
    seen.set(key, i + 1);
    if (i === 0) return p;
    const ang = i * 2.399963; // ángulo áureo
    const r = 0.0035 * Math.sqrt(i);
    return { lng: p.lng + Math.cos(ang) * r, lat: p.lat + Math.sin(ang) * r * 0.9 };
  });
}

export function buildPins(data: Dataset, layer: LayerId, gaz: Gazetteer, depto?: number | null): FeatureCollection<Point> {
  const raw: { p: { lng: number; lat: number; approx: boolean }; props: Record<string, unknown> }[] = [];
  if (layer === "produccion") {
    for (const f of data.films) {
      f.locations.forEach((l, i) => {
        if (isAbroad(l)) return;
        if (depto != null && (l.depto_ine ?? gaz.muni(l.muni_ine)?.depto_ine) !== depto) return;
        const p = locationPoint(l, gaz);
        if (!p) return;
        raw.push({
          p,
          props: {
            kind: "film",
            slug: f.slug,
            title: f.title,
            sub: l.site ?? gaz.muni(l.muni_ine)?.name ?? "",
            approx: p.approx,
            incomplete: f.completeness < 100,
            loc: i,
          },
        });
      });
    }
  } else {
    for (const o of data.orgs) {
      if (o.layer !== layer) continue;
      if (depto != null && (o.depto_ine ?? gaz.muni(o.muni_ine)?.depto_ine) !== depto) continue;
      const p = locationPoint(o, gaz);
      if (!p) continue;
      raw.push({
        p,
        props: {
          kind: "org",
          slug: o.slug,
          title: o.name,
          sub: categoriesText(o),
          approx: p.approx,
          incomplete: o.completeness < 100,
        },
      });
    }
  }
  const spreadPts = spread(raw.map((r) => r.p));
  const features: Pt[] = raw.map((r, i) => ({
    type: "Feature",
    properties: r.props,
    geometry: { type: "Point", coordinates: [spreadPts[i].lng, spreadPts[i].lat] },
  }));
  return { type: "FeatureCollection", features: features as Feature<Point>[] };
}

export interface LabelSets {
  depto: FeatureCollection<Point>;
  muni: FeatureCollection<Point>;
}

export function buildLabels(
  gaz: Gazetteer,
  aggs: Aggregates,
  metric: MetricId,
  layer: LayerId,
): LabelSets {
  const mk = (type: "depto" | "muni"): FeatureCollection<Point> => ({
    type: "FeatureCollection",
    features: gaz.entries
      .filter((e) => e.type === type)
      .map((e) => {
        const a = (type === "depto" ? aggs.depto : aggs.muni).get(e.code);
        const v = metricValue(a, metric);
        return {
          type: "Feature" as const,
          properties: {
            name: type === "depto" ? e.name.toUpperCase() : e.name,
            val: metricText(a, metric, layer),
            v,
            sk: -v,
          },
          geometry: { type: "Point" as const, coordinates: e.center },
        };
      }),
  });
  return { depto: mk("depto"), muni: mk("muni") };
}

/** Nivel 0..5 de cada territorio para pintar la coropleta (feature-state `t`). */
export function levels(map: Map<number, Agg>, metric: MetricId, all: number[]) {
  const stops = buildStops([...map.values()].map((a) => a[metric]));
  const out = new Map<number, number>();
  for (const code of all) out.set(code, levelOf(stops, metricValue(map.get(code), metric)));
  return { levels: out, stops };
}

export function buildFilmRoute(film: Film, gaz: Gazetteer) {
  const pts: { lng: number; lat: number; n: number; site: string; approx: boolean }[] = [];
  film.locations.forEach((l, i) => {
    // lo rodado fuera de Guatemala no está en el territorio: va en su propia zona
    if (isAbroad(l)) return;
    const p = locationPoint(l, gaz);
    if (p) pts.push({ ...p, n: i + 1, site: l.site ?? gaz.muni(l.muni_ine)?.name ?? gaz.depto(l.depto_ine)?.name ?? "" });
  });
  const spreadPts = spread(pts);
  const points: FeatureCollection<Point> = {
    type: "FeatureCollection",
    features: pts.map((p, i) => ({
      type: "Feature",
      properties: { n: String(p.n), site: p.site, approx: p.approx },
      geometry: { type: "Point", coordinates: [spreadPts[i].lng, spreadPts[i].lat] },
    })),
  };
  const lines: FeatureCollection<LineString> = {
    type: "FeatureCollection",
    features:
      pts.length > 1
        ? [
            {
              type: "Feature",
              properties: {},
              geometry: { type: "LineString", coordinates: spreadPts.map((p) => [p.lng, p.lat]) },
            },
          ]
        : [],
  };
  return { points, lines, coords: spreadPts.map((p) => [p.lng, p.lat] as [number, number]) };
}

/** Polígono "mundo menos Guatemala": atenúa lo que está fuera del país. */
export function buildMask(pais: GeometryCollection): FeatureCollection<Polygon> {
  const holes: number[][][] = [];
  for (const g of pais.geometries) {
    if (g.type !== "Polygon" && g.type !== "MultiPolygon") continue;
    const polys = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
    for (const p of polys) holes.push(p[0]);
  }
  const world: number[][] = [
    [-180, -85],
    [180, -85],
    [180, 85],
    [-180, 85],
    [-180, -85],
  ];
  return {
    type: "FeatureCollection",
    features: [{ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [world, ...holes] } }],
  };
}

// ───────────────────────── producciones sin lugar de rodaje y rodadas fuera de Guatemala ─────────────────────────

/**
 * Las producciones sin locación no se esconden: se agrupan en una zona marcada en el Pacífico,
 * fuera del territorio, para que se vea que existen pero que todavía no tienen lugar.
 */
export const NOWHERE = { lng: -93.6, lat: 12.7, radius: 0.72 };

/** Las producciones con locaciones en otro país tienen su propia zona, debajo de «Sin locación». */
export const ABROAD = { lng: -93.6, lat: 10.75, radius: 0.72 };

/** Sin ninguna locación que diga dónde se rodó (ni en Guatemala ni afuera). */
export { isUnlocated };
export const unlocatedFilms = <F extends Pick<Film, "locations">>(films: F[]) => films.filter(isUnlocated);

/** Con al menos una locación fuera de Guatemala (puede tener otras dentro: aparece en ambos lados). */
export const hasAbroad = (f: Pick<Film, "locations">) => f.locations.some(isAbroad);
export const abroadFilms = <F extends Pick<Film, "locations">>(films: F[]) => films.filter(hasAbroad);

type Zone = { lng: number; lat: number; radius: number };
type Bbox = [number, number, number, number];

const zoneBbox = (z: Zone): Bbox => [
  z.lng - z.radius / Math.cos((z.lat * Math.PI) / 180),
  z.lat - z.radius,
  z.lng + z.radius / Math.cos((z.lat * Math.PI) / 180),
  z.lat + z.radius,
];

/** [oeste, sur, este, norte] de cada zona. */
export const NOWHERE_BBOX: Bbox = zoneBbox(NOWHERE);
export const ABROAD_BBOX: Bbox = zoneBbox(ABROAD);

/** El encuadre del país ampliado para incluir las zonas que existen. */
export function withZones(base: Bbox, zones: { nowhere?: boolean; abroad?: boolean }): Bbox {
  let b: Bbox = [...base];
  for (const [on, z] of [[zones.nowhere, NOWHERE_BBOX], [zones.abroad, ABROAD_BBOX]] as const) {
    if (on) b = [Math.min(b[0], z[0]), Math.min(b[1], z[1]), Math.max(b[2], z[2]), Math.max(b[3], z[3])];
  }
  return b;
}

function buildZone(z: Zone, id: "nowhere" | "abroad", title: string, count: number, selected: boolean): FeatureCollection<Polygon | Point> {
  if (count <= 0) return { type: "FeatureCollection", features: [] };
  const k = Math.cos((z.lat * Math.PI) / 180);
  const ring: number[][] = [];
  for (let i = 0; i <= 64; i++) {
    const a = (i / 64) * Math.PI * 2;
    ring.push([z.lng + (Math.cos(a) * z.radius) / k, z.lat + Math.sin(a) * z.radius]);
  }
  return {
    type: "FeatureCollection",
    features: [
      { type: "Feature", properties: { kind: "zone", zone: id, sel: selected }, geometry: { type: "Polygon", coordinates: [ring] } },
      {
        type: "Feature",
        properties: { kind: "label", zone: id, title, count, text: count === 1 ? "1 producción" : `${count.toLocaleString("es-GT")} producciones` },
        geometry: { type: "Point", coordinates: [z.lng, z.lat] },
      },
    ],
  };
}

export const buildNowhere = (count: number, selected: boolean) => buildZone(NOWHERE, "nowhere", "Sin locación", count, selected);
export const buildAbroad = (count: number, selected: boolean) => buildZone(ABROAD, "abroad", "Fuera de Guatemala", count, selected);
