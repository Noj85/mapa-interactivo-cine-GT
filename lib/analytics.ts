/**
 * Estadísticas de visitas: tipos, rangos de fechas, filtros y el agregador que usa el modo local.
 * Sin dependencias de servidor, así que también lo puede importar el cliente (tipos y rangos).
 * En producción, el mismo resumen lo calcula la función SQL `analytics_overview` (migración 0023).
 */

export type EventKind = "view" | "film" | "place" | "search" | "layer" | "download" | "contribute";
export const EVENT_KINDS: readonly EventKind[] = ["view", "film", "place", "search", "layer", "download", "contribute"];

export type Device = "desktop" | "mobile" | "tablet";

/** Un evento ya limpio, listo para guardar. Nunca lleva IP ni datos personales. */
export interface SiteEvent {
  kind: EventKind;
  path?: string | null;
  /** Hash que cambia cada día: sirve solo para contar visitantes únicos por día. */
  visitor?: string | null;
  country?: string | null;
  device?: Device | null;
  browser?: string | null;
  ref_host?: string | null;
  /** Qué se miró: título de la producción, lugar, término de búsqueda, capa, «tipo · formato»... */
  label?: string | null;
  meta?: Record<string, unknown> | null;
  created_at?: string;
}

export interface Ranked {
  name: string;
  n: number;
}

export interface DayPoint {
  /** AAAA-MM-DD en hora de Guatemala. */
  d: string;
  views: number;
  visitors: number;
  films: number;
  downloads: number;
}

export interface AnalyticsOverview {
  totals: { views: number; visitors: number; films: number; downloads: number; searches: number; contributions: number };
  daily: DayPoint[];
  topPaths: Ranked[];
  topFilms: Ranked[];
  topPlaces: Ranked[];
  topSearches: Ranked[];
  layers: Ranked[];
  downloads: Ranked[];
  contributions: Ranked[];
  countries: Ranked[];
  devices: Ranked[];
  browsers: Ranked[];
  referrers: Ranked[];
}

export const emptyOverview = (): AnalyticsOverview => ({
  totals: { views: 0, visitors: 0, films: 0, downloads: 0, searches: 0, contributions: 0 },
  daily: [],
  topPaths: [],
  topFilms: [],
  topPlaces: [],
  topSearches: [],
  layers: [],
  downloads: [],
  contributions: [],
  countries: [],
  devices: [],
  browsers: [],
  referrers: [],
});

/** Completa lo que falte (por si el RPC devuelve algo parcial o null). */
export function normalizeOverview(raw: unknown): AnalyticsOverview {
  const base = emptyOverview();
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Partial<AnalyticsOverview>;
  const list = (v: unknown): Ranked[] =>
    Array.isArray(v) ? v.map((x) => ({ name: String((x as Ranked).name ?? ""), n: Number((x as Ranked).n) || 0 })).filter((x) => x.name) : [];
  return {
    totals: { ...base.totals, ...Object.fromEntries(Object.entries(r.totals ?? {}).map(([k, v]) => [k, Number(v) || 0])) },
    daily: Array.isArray(r.daily)
      ? r.daily.map((x) => ({
          d: String(x.d),
          views: Number(x.views) || 0,
          visitors: Number(x.visitors) || 0,
          films: Number(x.films) || 0,
          downloads: Number(x.downloads) || 0,
        }))
      : [],
    topPaths: list(r.topPaths),
    topFilms: list(r.topFilms),
    topPlaces: list(r.topPlaces),
    topSearches: list(r.topSearches),
    layers: list(r.layers),
    downloads: list(r.downloads),
    contributions: list(r.contributions),
    countries: list(r.countries),
    devices: list(r.devices),
    browsers: list(r.browsers),
    referrers: list(r.referrers),
  };
}

// ---------- rangos (en hora de Guatemala, UTC-6 todo el año) ----------

const GT_OFFSET_MS = 6 * 3600 * 1000;
const DAY_MS = 24 * 3600 * 1000;

export const RANGES = ["hoy", "7", "30", "90", "todo"] as const;
export type RangeKey = (typeof RANGES)[number];
export const RANGE_LABELS: Record<RangeKey, string> = { hoy: "Hoy", "7": "7 días", "30": "30 días", "90": "90 días", todo: "Todo" };

export const parseRange = (v: string | undefined | null): RangeKey => (RANGES as readonly string[]).includes(v ?? "") ? (v as RangeKey) : "30";

/** Día (AAAA-MM-DD) en hora de Guatemala de un instante. */
export const gtDay = (t: number | Date) => new Date((typeof t === "number" ? t : t.getTime()) - GT_OFFSET_MS).toISOString().slice(0, 10);

/** Instante (UTC) en que empieza el día `AAAA-MM-DD` en Guatemala. */
const gtDayStart = (day: string) => Date.parse(`${day}T00:00:00Z`) + GT_OFFSET_MS;

export interface RangeBounds {
  key: RangeKey;
  from: string;
  to: string;
  /** Periodo anterior de igual duración, para comparar (no hay en «Todo»). */
  prev: { from: string; to: string } | null;
  /** Días (AAAA-MM-DD) que cubre el periodo, para completar la gráfica con ceros. */
  days: string[];
}

export function rangeBounds(key: RangeKey, now: Date = new Date()): RangeBounds {
  const today = gtDay(now);
  const tomorrowStart = gtDayStart(today) + DAY_MS;
  if (key === "todo") {
    const from = Date.parse("2024-01-01T00:00:00Z");
    return { key, from: new Date(from).toISOString(), to: new Date(tomorrowStart).toISOString(), prev: null, days: [] };
  }
  const n = key === "hoy" ? 1 : Number(key);
  const fromMs = tomorrowStart - n * DAY_MS;
  const days: string[] = [];
  for (let i = 0; i < n; i++) days.push(gtDay(fromMs + i * DAY_MS + DAY_MS / 2));
  return {
    key,
    from: new Date(fromMs).toISOString(),
    to: new Date(tomorrowStart).toISOString(),
    prev: { from: new Date(fromMs - n * DAY_MS).toISOString(), to: new Date(fromMs).toISOString() },
    days,
  };
}

/** Lista de días de la gráfica: los del rango; en «Todo», desde el primer dato hasta hoy. */
export function fillDays(daily: DayPoint[], days: string[], now: Date = new Date()): DayPoint[] {
  let list = days;
  if (!list.length) {
    if (!daily.length) return [];
    const first = daily[0].d;
    const out: string[] = [];
    for (let t = gtDayStart(first); gtDay(t + DAY_MS / 2) <= gtDay(now); t += DAY_MS) out.push(gtDay(t + DAY_MS / 2));
    list = out;
  }
  const by = new Map(daily.map((p) => [p.d, p]));
  return list.map((d) => by.get(d) ?? { d, views: 0, visitors: 0, films: 0, downloads: 0 });
}

/** Cambio porcentual frente al periodo anterior; null si no hay con qué comparar. */
export function pctChange(now: number, before: number | null | undefined): number | null {
  if (before == null || before <= 0) return null;
  return Math.round(((now - before) / before) * 100);
}

// ---------- limpieza y filtros ----------

const BOT_RE = /bot|crawl|spider|slurp|headless|lighthouse|pagespeed|preview|facebookexternalhit|whatsapp|telegram|discord|curl|wget|python-requests|axios|node-fetch|go-http|monitor|uptime|pingdom|gtmetrix|semrush|ahrefs|mj12|bytespider|petalbot|yandex|baidu|duckduck|archive\.org|vercel/i;

/** Rastreadores, vistas previas de enlaces y herramientas de monitoreo: no son personas. */
export const isBot = (ua: string | null | undefined) => !ua || BOT_RE.test(ua);

export function parseUA(ua: string): { device: Device; browser: string } {
  const device: Device = /ipad|tablet|(android(?!.*mobile))/i.test(ua) ? "tablet" : /mobi|iphone|ipod|android/i.test(ua) ? "mobile" : "desktop";
  let browser = "Otro";
  if (/edg(e|a|ios)?\//i.test(ua)) browser = "Edge";
  else if (/opr\/|opera/i.test(ua)) browser = "Opera";
  else if (/samsungbrowser/i.test(ua)) browser = "Samsung Internet";
  else if (/firefox|fxios/i.test(ua)) browser = "Firefox";
  else if (/chrome|crios|chromium/i.test(ua)) browser = /brave/i.test(ua) ? "Brave" : "Chrome";
  else if (/safari/i.test(ua)) browser = "Safari";
  return { device, browser };
}

const clip = (v: unknown, max: number) => {
  if (typeof v !== "string") return null;
  const t = v.replace(/\s+/g, " ").trim().slice(0, max);
  return t || null;
};

/** Ruta limpia: sin parámetros ni fragmento, y sin identificadores de registros privados. */
export function cleanPath(v: unknown): string | null {
  const s = clip(v, 200);
  if (!s || !s.startsWith("/")) return null;
  return s.split(/[?#]/)[0] || "/";
}

/** Dominio de origen de la visita (sin ruta ni parámetros); null si viene del propio sitio o no hay. */
export function refHost(ref: unknown, ownHost: string | null): string | null {
  const s = clip(ref, 300);
  if (!s) return null;
  try {
    const h = new URL(s).hostname.replace(/^www\./, "").toLowerCase();
    if (!h || h === ownHost?.replace(/^www\./, "").toLowerCase() || h === "localhost") return null;
    return h.slice(0, 100);
  } catch {
    return null;
  }
}

/** Términos de búsqueda: en minúsculas y sin correos ni números largos (podrían ser datos personales). */
export function cleanSearchTerm(v: unknown): string | null {
  const s = clip(v, 60)?.toLowerCase();
  if (!s || s.length < 2) return null;
  if (/@/.test(s) || /\d{6,}/.test(s)) return null;
  return s;
}

export const cleanLabel = (v: unknown) => clip(v, 120);

// ---------- agregador (modo local) ----------

const top = (map: Map<string, number>, limit?: number): Ranked[] => {
  const all = [...map.entries()].map(([name, n]) => ({ name, n })).sort((a, b) => b.n - a.n || a.name.localeCompare(b.name, "es"));
  return limit ? all.slice(0, limit) : all;
};
const bump = (m: Map<string, number>, k: string | null | undefined, by = 1) => {
  if (k) m.set(k, (m.get(k) ?? 0) + by);
};

/** Mismo resultado que la función SQL `analytics_overview`, calculado en memoria. */
export function aggregateEvents(events: SiteEvent[], from: string, to: string): AnalyticsOverview {
  const f = Date.parse(from);
  const t = Date.parse(to);
  const inRange = events.filter((e) => {
    const ms = Date.parse(e.created_at ?? "");
    return ms >= f && ms < t;
  });
  const out = emptyOverview();
  const visitors = new Set<string>();
  const days = new Map<string, { views: number; visitors: Set<string>; films: number; downloads: number }>();
  const maps = {
    paths: new Map<string, number>(),
    films: new Map<string, number>(),
    places: new Map<string, number>(),
    searches: new Map<string, number>(),
    layers: new Map<string, number>(),
    downloads: new Map<string, number>(),
    contributions: new Map<string, number>(),
  };
  const uniq = {
    countries: new Map<string, Set<string>>(),
    devices: new Map<string, Set<string>>(),
    browsers: new Map<string, Set<string>>(),
    referrers: new Map<string, Set<string>>(),
  };
  const addUniq = (m: Map<string, Set<string>>, k: string | null | undefined, v: string) => {
    if (!k) return;
    (m.get(k) ?? m.set(k, new Set()).get(k)!).add(v);
  };

  for (const e of inRange) {
    const day = gtDay(Date.parse(e.created_at!));
    const d = days.get(day) ?? days.set(day, { views: 0, visitors: new Set(), films: 0, downloads: 0 }).get(day)!;
    const v = e.visitor ?? "";
    switch (e.kind) {
      case "view":
        out.totals.views++;
        d.views++;
        if (v) {
          visitors.add(v);
          d.visitors.add(v);
        }
        bump(maps.paths, e.path);
        addUniq(uniq.countries, e.country, v);
        addUniq(uniq.devices, e.device, v);
        addUniq(uniq.browsers, e.browser, v);
        addUniq(uniq.referrers, e.ref_host, v);
        break;
      case "film":
        out.totals.films++;
        d.films++;
        bump(maps.films, e.label);
        break;
      case "place":
        bump(maps.places, e.label);
        break;
      case "search":
        out.totals.searches++;
        bump(maps.searches, e.label);
        break;
      case "layer":
        bump(maps.layers, e.label);
        break;
      case "download":
        out.totals.downloads++;
        d.downloads++;
        bump(maps.downloads, e.label);
        break;
      case "contribute":
        out.totals.contributions++;
        bump(maps.contributions, e.label);
        break;
    }
  }
  out.totals.visitors = visitors.size;
  out.daily = [...days.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([d, x]) => ({ d, views: x.views, visitors: x.visitors.size, films: x.films, downloads: x.downloads }));
  out.topPaths = top(maps.paths, 10);
  out.topFilms = top(maps.films, 10);
  out.topPlaces = top(maps.places, 10);
  out.topSearches = top(maps.searches, 10);
  out.layers = top(maps.layers);
  out.downloads = top(maps.downloads, 10);
  out.contributions = top(maps.contributions);
  const sizes = (m: Map<string, Set<string>>) => new Map([...m.entries()].map(([k, s]) => [k, s.size]));
  out.countries = top(sizes(uniq.countries), 10);
  out.devices = top(sizes(uniq.devices));
  out.browsers = top(sizes(uniq.browsers), 8);
  out.referrers = top(sizes(uniq.referrers), 10);
  return out;
}
