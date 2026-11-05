import type { Dataset, Film, LayerId, MetricId, Org } from "@/lib/types";

export interface Agg {
  films: number;
  days: number;
  spend: number;
  jobs: number;
  orgs: number;
}

const empty = (): Agg => ({ films: 0, days: 0, spend: 0, jobs: 0, orgs: 0 });

export interface Aggregates {
  depto: Map<number, Agg>;
  muni: Map<number, Agg>;
  total: Agg;
}

/** Suma por territorio para una capa. Una producción cuenta una vez por territorio. */
export function aggregate(data: Dataset, layer: LayerId): Aggregates {
  const depto = new Map<number, Agg>();
  const muni = new Map<number, Agg>();
  const total = empty();
  const get = (m: Map<number, Agg>, k: number) => {
    let v = m.get(k);
    if (!v) m.set(k, (v = empty()));
    return v;
  };

  if (layer === "produccion") {
    for (const f of data.films) {
      const dSeen = new Set<number>();
      const mSeen = new Set<number>();
      let counted = false;
      for (const l of f.locations) {
        const dep = l.depto_ine ?? (l.muni_ine != null ? Math.floor(l.muni_ine / 100) : null);
        const mu = l.muni_ine;
        if (dep != null) {
          const a = get(depto, dep);
          a.days += l.days ?? 0;
          a.spend += l.local_spend ?? 0;
          a.jobs += l.jobs ?? 0;
          if (!dSeen.has(dep)) {
            a.films++;
            dSeen.add(dep);
          }
        }
        if (mu != null) {
          const a = get(muni, mu);
          a.days += l.days ?? 0;
          a.spend += l.local_spend ?? 0;
          a.jobs += l.jobs ?? 0;
          if (!mSeen.has(mu)) {
            a.films++;
            mSeen.add(mu);
          }
        }
        total.days += l.days ?? 0;
        total.spend += l.local_spend ?? 0;
        total.jobs += l.jobs ?? 0;
        counted = true;
      }
      if (counted) total.films++;
    }
  } else {
    for (const o of data.orgs) {
      if (o.layer !== layer) continue;
      const dep = o.depto_ine ?? (o.muni_ine != null ? Math.floor(o.muni_ine / 100) : null);
      if (dep != null) get(depto, dep).orgs++;
      if (o.muni_ine != null) get(muni, o.muni_ine).orgs++;
      total.orgs++;
    }
  }
  return { depto, muni, total };
}

export const metricValue = (a: Agg | undefined, metric: MetricId) => (a ? a[metric] : 0);

export function filmsIn(data: Dataset, scope: { depto?: number; muni?: number }): Film[] {
  return data.films.filter((f) =>
    f.locations.some((l) =>
      scope.muni != null
        ? l.muni_ine === scope.muni
        : (l.depto_ine ?? (l.muni_ine != null ? Math.floor(l.muni_ine / 100) : null)) === scope.depto,
    ),
  );
}

export function orgsIn(data: Dataset, layer: LayerId, scope: { depto?: number; muni?: number }): Org[] {
  return data.orgs.filter(
    (o) =>
      o.layer === layer &&
      (scope.muni != null
        ? o.muni_ine === scope.muni
        : (o.depto_ine ?? (o.muni_ine != null ? Math.floor(o.muni_ine / 100) : null)) === scope.depto),
  );
}

export interface Stop {
  /** Valor mínimo (inclusive) de este escalón. */
  from: number;
  /** Índice 1..5 en la rampa de color. */
  color: number;
}

/**
 * Escalones de la coropleta por cuantiles sobre los valores > 0.
 * Con pocos valores distintos usa menos escalones (y los colores más fuertes).
 */
export function buildStops(values: number[], maxSteps = 5): Stop[] {
  const v = values.filter((x) => x > 0).sort((a, b) => a - b);
  if (!v.length) return [];
  const distinct = [...new Set(v)];
  let lowers: number[] = [];
  if (distinct.length <= maxSteps) lowers = distinct;
  else {
    for (let i = 0; i < maxSteps; i++) {
      const x = v[Math.min(v.length - 1, Math.floor((i / maxSteps) * v.length))];
      if (!lowers.length || x > lowers[lowers.length - 1]) lowers.push(x);
    }
    // si los cuantiles se aplastan (datos muy sesgados), usar los valores distintos más altos
    if (lowers.length < 3) lowers = [distinct[0], distinct[Math.floor(distinct.length / 3)], distinct[Math.floor((2 * distinct.length) / 3)], distinct[distinct.length - 1]].filter((x, i, a) => a.indexOf(x) === i);
  }
  const n = lowers.length;
  return lowers.map((from, i) => ({
    from,
    color: n === 1 ? 5 : Math.round(1 + (i * 4) / (n - 1)),
  }));
}

export function levelOf(stops: Stop[], v: number) {
  if (v <= 0 || !stops.length) return 0;
  let c = stops[0].color;
  for (const s of stops) if (v >= s.from) c = s.color;
  return c;
}
