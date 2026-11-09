import { isAbroad } from "@/lib/completeness";
import { fmtInt } from "@/lib/utils";

/**
 * Regla de locaciones de una producción (solo dentro de Guatemala; las de fuera no se tocan):
 *  - Dentro de un departamento, una locación distinta existe solo si tiene un municipio distinto.
 *    «Sin municipio» no cuenta como locación aparte.
 *  - Dos filas con el mismo municipio son la misma locación (el criterio es el municipio, no el sitio).
 *  - Varias filas del mismo departamento sin municipio son una sola.
 *  - Una fila sin municipio y UNA sola locación con municipio en el departamento: es la misma locación duplicada.
 *  - Al unir, las cifras (días, inversión, empleos) nunca se suman: se conserva la mayor. El sitio y las
 *    coordenadas se completan si a la que se queda le faltan.
 *  - Un departamento con dos o más municipios y además una fila sin municipio: no se sabe de cuál es duplicada,
 *    así que esa fila no se toca y se avisa para decidirla a mano.
 */

export interface LocLike {
  id?: string;
  depto_ine?: number | null;
  muni_ine?: number | null;
  country?: string | null;
  site?: string | null;
  lat?: number | null;
  lng?: number | null;
  days?: number | null;
  local_spend?: number | null;
  jobs?: number | null;
  confidence?: number | null;
}

export type UnifyReason = "mismo_municipio" | "sin_municipio_en_municipio" | "mismo_departamento";

export const UNIFY_REASON_LABEL: Record<UnifyReason, string> = {
  mismo_municipio: "Mismo municipio",
  sin_municipio_en_municipio: "Fila sin municipio, duplicada de la locación con municipio",
  mismo_departamento: "Mismo departamento sin municipio",
};

export interface MergedGroup<T> {
  reason: UnifyReason;
  /** Filas originales que se unieron (la primera es la base, la que se queda). */
  from: T[];
  /** Cómo quedó la locación. */
  result: T;
  /** Qué datos pasaron de otra fila a la que se queda («Días: 3 → 5»). */
  changes: string[];
}

export interface ManualCase<T> {
  depto: number;
  /** Municipios distintos que tiene el departamento. */
  munis: number[];
  /** Filas sin municipio que no se tocaron. */
  rows: T[];
}

export interface UnifyResult<T> {
  locations: T[];
  merged: MergedGroup<T>[];
  manual: ManualCase<T>[];
}

const deptoOf = (l: LocLike): number | null => l.depto_ine ?? (l.muni_ine != null ? Math.floor(l.muni_ine / 100) : null);
const has = (v: unknown) => v !== null && v !== undefined && v !== "";
const hasSite = (l: LocLike) => !!(l.site ?? "").trim();
const hasCoords = (l: LocLike) => l.lat != null && l.lng != null;

/** Qué tan completa es una fila (para elegir cuál se queda). */
function score(l: LocLike): number {
  return (l.muni_ine != null ? 4 : 0) + (hasCoords(l) ? 2 : 0) + (hasSite(l) ? 1 : 0) + (has(l.days) ? 1 : 0) + (has(l.local_spend) ? 1 : 0) + (has(l.jobs) ? 1 : 0);
}

const maxOf = (rows: LocLike[], k: "days" | "local_spend" | "jobs" | "confidence"): number | null => {
  let best: number | null = null;
  for (const r of rows) {
    const v = r[k];
    if (v != null && (best === null || v > best)) best = v;
  }
  return best;
};

/** Une filas de una misma locación: la base manda; las cifras son las mayores; lo vacío se completa. */
function mergeRows<T extends LocLike>(rows: T[]): { base: T; result: T; changes: string[] } {
  // base: entre las filas con municipio (si hay), la más completa; empate: la primera
  const pool = rows.some((r) => r.muni_ine != null) ? rows.filter((r) => r.muni_ine != null) : rows;
  const ranked = pool.map((r, i) => ({ r, i })).sort((a, b) => score(b.r) - score(a.r) || a.i - b.i);
  const base = ranked[0].r;
  const others = rows.filter((r) => r !== base);
  const result: T = { ...base };
  const changes: string[] = [];
  const num = (k: "days" | "local_spend" | "jobs", label: string, fmt: (n: number) => string) => {
    const v = maxOf(rows, k);
    if (v !== null && v !== (base[k] ?? null)) {
      result[k] = v as T[typeof k];
      changes.push(`${label}: ${base[k] != null ? fmt(base[k]!) : "vacío"} → ${fmt(v)}`);
    }
  };
  num("days", "Días", (n) => fmtInt(n));
  num("local_spend", "Inversión local", (n) => `Q ${fmtInt(n)}`);
  num("jobs", "Empleos", (n) => fmtInt(n));
  const conf = maxOf(rows, "confidence");
  if (conf !== null) result.confidence = conf;
  if (!hasSite(base)) {
    const s = others.find(hasSite);
    if (s) {
      result.site = s.site;
      changes.push(`Sitio: «${(s.site ?? "").trim()}»`);
    }
  }
  if (!hasCoords(base)) {
    const c = others.find(hasCoords);
    if (c) {
      result.lat = c.lat;
      result.lng = c.lng;
      changes.push(`Coordenadas: ${c.lat}, ${c.lng}`);
    }
  }
  return { base, result, changes };
}

/** Aplica la regla a la lista de locaciones de una producción. No modifica la lista recibida. */
export function unifyLocations<T extends LocLike>(locs: T[]): UnifyResult<T> {
  // lugar de cada fila en el resultado: el de la primera fila de su grupo
  const slots: { at: number; rows: T[]; reason: UnifyReason | null }[] = [];
  const manual: ManualCase<T>[] = [];

  const byDepto = new Map<number, number[]>();
  locs.forEach((l, i) => {
    const d = isAbroad(l) ? null : deptoOf(l);
    if (d === null) {
      slots.push({ at: i, rows: [l], reason: null });
      return;
    }
    byDepto.set(d, [...(byDepto.get(d) ?? []), i]);
  });

  for (const [depto, idx] of byDepto) {
    const withMuni = idx.filter((i) => locs[i].muni_ine != null);
    const noMuni = idx.filter((i) => locs[i].muni_ine == null);
    const byMuni = new Map<number, number[]>();
    for (const i of withMuni) byMuni.set(locs[i].muni_ine!, [...(byMuni.get(locs[i].muni_ine!) ?? []), i]);
    const munis = [...byMuni.keys()];

    for (const [, group] of byMuni) {
      slots.push({ at: group[0], rows: group.map((i) => locs[i]), reason: group.length > 1 ? "mismo_municipio" : null });
    }
    if (!noMuni.length) continue;
    if (munis.length === 0) {
      slots.push({ at: noMuni[0], rows: noMuni.map((i) => locs[i]), reason: noMuni.length > 1 ? "mismo_departamento" : null });
    } else if (munis.length === 1) {
      // la fila sin municipio es la misma locación: se une a la del municipio
      const slot = slots.find((s) => s.rows.some((r) => r.muni_ine === munis[0] && deptoOf(r) === depto))!;
      slot.rows.push(...noMuni.map((i) => locs[i]));
      slot.reason = slot.reason === "mismo_municipio" ? "mismo_municipio" : "sin_municipio_en_municipio";
    } else {
      // no se sabe de cuál municipio es: queda como está y se avisa
      for (const i of noMuni) slots.push({ at: i, rows: [locs[i]], reason: null });
      manual.push({ depto, munis, rows: noMuni.map((i) => locs[i]) });
    }
  }

  slots.sort((a, b) => a.at - b.at);
  const merged: MergedGroup<T>[] = [];
  const out: T[] = [];
  for (const s of slots) {
    if (s.rows.length === 1) {
      out.push(s.rows[0]);
      continue;
    }
    const { base, result, changes } = mergeRows(s.rows);
    // la base va primero en `from`
    merged.push({ reason: s.reason ?? "mismo_municipio", from: [base, ...s.rows.filter((r) => r !== base)], result, changes });
    out.push(result);
  }
  return { locations: out, merged, manual };
}

/**
 * Dónde quedó cada fila original en la lista unificada (por índice). Sirve para llevar avisos que apuntan a una
 * locación («location:2») a su nueva posición.
 */
export function unifiedIndexMap<T extends LocLike>(original: T[], res: UnifyResult<T>): number[] {
  return original.map((o) => {
    const direct = res.locations.indexOf(o);
    if (direct >= 0) return direct;
    const g = res.merged.find((m) => m.from.includes(o));
    return g ? res.locations.indexOf(g.result) : -1;
  });
}

/** ¿La lista tiene algo que unir o revisar? */
export function locationsNeedWork(locs: LocLike[]): boolean {
  const r = unifyLocations(locs);
  return r.merged.length > 0 || r.manual.length > 0;
}
